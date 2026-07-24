import { describe, expect, it } from 'vitest'
import type {
  ActionReceipt,
  ArtifactVerification,
  OutboxItem,
  PlannedAction,
} from '@pm-agent/domain'
import type { ArtifactConnector, ConnectorStatus, PreflightResult, VerificationResult } from '@pm-agent/connectors'
import { executeConnectorAction, type ExecutionRepository } from './execution'

interface TestPlan { value: string }
interface TestSnapshot { value: string }

const action: PlannedAction = {
  schemaVersion: 1,
  id: 'ACTION-TEST',
  runId: 'RUN-TEST',
  target: 'jira',
  operation: 'create',
  entityIds: ['REQ-TEST'],
  payload: { planHash: 'hash' },
  payloadHash: 'payload-hash',
  status: 'approved',
}

class MemoryExecutionRepository implements ExecutionRepository {
  receipt: ActionReceipt | null = null
  verification: ArtifactVerification | null = null
  failures: string[] = []
  failVerificationSaveOnce = false

  claim(): OutboxItem {
    return {
      schemaVersion: 1,
      id: 'OUTBOX-TEST',
      action,
      status: this.receipt ? 'verifying' : 'executing',
      attempts: 1,
      lastError: null,
      availableAt: '2026-07-22T00:00:00.000Z',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    }
  }
  getReceipt(): ActionReceipt | null { return this.receipt }
  saveReceipt(receipt: ActionReceipt): ActionReceipt { this.receipt = receipt; return receipt }
  saveVerification(verification: ArtifactVerification): ArtifactVerification {
    if (this.failVerificationSaveOnce) {
      this.failVerificationSaveOnce = false
      throw new Error('simulated crash after receipt')
    }
    this.verification = verification
    return verification
  }
  markFailure(_actionId: string, error: string): void { this.failures.push(error) }
}

class TestConnector implements ArtifactConnector<TestPlan, TestPlan, TestSnapshot> {
  readonly target = 'jira' as const
  executeCount = 0
  preflightCount = 0
  mismatch = false
  checkAvailability(): Promise<ConnectorStatus> { return Promise.resolve({ available: true, label: 'ready', detail: 'test' }) }
  preflight(plan: TestPlan): Promise<PreflightResult<TestPlan>> {
    this.preflightCount += 1
    return Promise.resolve({ allowed: true, plan, planHash: 'hash', issues: [] })
  }
  execute(): Promise<ActionReceipt> {
    this.executeCount += 1
    return Promise.resolve({
      schemaVersion: 1,
      id: 'RECEIPT-TEST',
      actionId: action.id,
      target: 'jira',
      externalId: 'MOCK-JIRA-1',
      payloadHash: action.payloadHash,
      idempotencyKey: 'jira:test',
      recordedAt: '2026-07-22T00:01:00.000Z',
    })
  }
  readBack(): Promise<TestSnapshot> { return Promise.resolve({ value: this.mismatch ? 'drift' : 'expected' }) }
  verify(plan: TestPlan, snapshot: TestSnapshot): Promise<VerificationResult> {
    return Promise.resolve(snapshot.value === plan.value
      ? { verified: true, issues: [] }
      : { verified: false, issues: [{ code: 'MISMATCH', severity: 'error', message: 'Read-back mismatch' }] })
  }
}

describe('receipt-first connector orchestration', () => {
  it('does not duplicate external write after a crash between receipt and verification', async () => {
    const repository = new MemoryExecutionRepository()
    repository.failVerificationSaveOnce = true
    const connector = new TestConnector()
    const now = () => '2026-07-22T00:02:00.000Z'

    const crashed = await executeConnectorAction({ action, plan: { value: 'expected' }, connector, repository, now })
    expect(crashed.status).toBe('failed')
    expect(repository.receipt).not.toBeNull()
    const recovered = await executeConnectorAction({ action, plan: { value: 'expected' }, connector, repository, now })

    expect(recovered.status).toBe('verified')
    expect(connector.executeCount).toBe(1)
    expect(repository.verification?.verified).toBe(true)
  })

  it('executes the exact prepared preflight covered by approval without resolving it again', async () => {
    const repository = new MemoryExecutionRepository()
    const connector = new TestConnector()
    const preparedPreflight = {
      allowed: true,
      plan: { value: 'expected' },
      planHash: 'hash',
      issues: [],
    } satisfies PreflightResult<TestPlan>

    const result = await executeConnectorAction({
      action,
      plan: { value: 'source' },
      preparedPreflight,
      connector,
      repository,
      now: () => '2026-07-22T00:02:00.000Z',
    })

    expect(result.status).toBe('verified')
    expect(connector.preflightCount).toBe(0)
  })

  it('records a verification mismatch without reporting success', async () => {
    const repository = new MemoryExecutionRepository()
    const connector = new TestConnector()
    connector.mismatch = true
    const result = await executeConnectorAction({
      action,
      plan: { value: 'expected' },
      connector,
      repository,
      now: () => '2026-07-22T00:02:00.000Z',
    })
    expect(result.status).toBe('verification_failed')
    expect(repository.verification).toMatchObject({ verified: false, issues: [{ code: 'MISMATCH' }] })
  })

  it('redacts connector credentials before persisting an error', async () => {
    const repository = new MemoryExecutionRepository()
    const connector = new TestConnector()
    connector.checkAvailability = () => Promise.reject(new Error('authorization: Bearer-secret token=raw-secret'))

    await executeConnectorAction({
      action,
      plan: { value: 'expected' },
      connector,
      repository,
      now: () => '2026-07-22T00:02:00.000Z',
    })

    expect(repository.failures).toEqual(['authorization=[REDACTED] token=[REDACTED]'])
  })
})
