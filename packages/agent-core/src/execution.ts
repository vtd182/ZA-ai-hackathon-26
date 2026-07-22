import type {
  ActionReceipt,
  ArtifactVerification,
  OutboxItem,
  PlannedAction,
} from '@pm-agent/domain'
import type {
  ArtifactConnector,
  PreflightResult,
  VerificationResult,
} from '@pm-agent/connectors'

export interface ExecutionRepository {
  claim(actionId: string, claimedAt: string): OutboxItem
  getReceipt(actionId: string): ActionReceipt | null
  saveReceipt(receipt: ActionReceipt): ActionReceipt
  saveVerification(verification: ArtifactVerification): ArtifactVerification
  markFailure(actionId: string, error: string, failedAt: string): void
}

export interface ConnectorExecutionResult {
  actionId: string
  status: 'verified' | 'failed' | 'verification_failed'
  receipt: ActionReceipt | null
  verification: VerificationResult | null
  error: string | null
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown connector failure'
  return message.replace(/(api[_-]?key|authorization|token)\s*[:=]\s*\S+/gi, '$1=[REDACTED]').slice(0, 1000)
}

export async function executeConnectorAction<TPlan, TPreparedPlan, TSnapshot>(input: {
  action: PlannedAction
  plan: TPlan
  connector: ArtifactConnector<TPlan, TPreparedPlan, TSnapshot>
  repository: ExecutionRepository
  now?: () => string
}): Promise<ConnectorExecutionResult> {
  const now = input.now ?? (() => new Date().toISOString())
  input.repository.claim(input.action.id, now())
  let receipt = input.repository.getReceipt(input.action.id)
  try {
    const availability = await input.connector.checkAvailability()
    if (!availability.available) throw new Error(availability.detail)
    const preflight: PreflightResult<TPreparedPlan> = await input.connector.preflight(input.plan)
    if (!preflight.allowed || preflight.issues.some((issue) => issue.severity === 'error')) {
      throw new Error(`Connector preflight blocked: ${preflight.issues.map((issue) => issue.code).join(', ')}`)
    }

    if (!receipt) {
      receipt = await input.connector.execute(input.action, preflight)
      receipt = input.repository.saveReceipt(receipt)
    }

    const snapshot = await input.connector.readBack(receipt)
    const verification = await input.connector.verify(preflight.plan, snapshot)
    input.repository.saveVerification({
      schemaVersion: 1,
      actionId: input.action.id,
      verified: verification.verified,
      issues: verification.issues,
      verifiedAt: now(),
    })
    return {
      actionId: input.action.id,
      status: verification.verified ? 'verified' : 'verification_failed',
      receipt,
      verification,
      error: verification.verified ? null : verification.issues.map((issue) => issue.message).join('; '),
    }
  } catch (error) {
    const message = safeError(error)
    input.repository.markFailure(input.action.id, message, now())
    return { actionId: input.action.id, status: 'failed', receipt, verification: null, error: message }
  }
}
