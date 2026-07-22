import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import type { FigmaTargetBinding, PlannedAction } from '@pm-agent/domain'
import { createFigmaArtifactPlan } from './figma-artifact-plan'
import { hashConnectorPayload, MockFigmaArtifactConnector } from './figma-connector'

const target: FigmaTargetBinding = {
  schemaVersion: 1,
  targetHash: 'a'.repeat(64),
  sessionId: 'mock:figma',
  fileName: 'Mock Figma sandbox',
  pageId: '0:1',
  pageName: 'Demo',
  allowedAt: '2026-07-22T00:00:00.000Z',
}

function approvedAction(planHash: string): PlannedAction {
  const payload = { schemaVersion: 1, planHash }
  return {
    schemaVersion: 1,
    id: 'action:figma:test',
    runId: 'RUN-TEST',
    target: 'figma',
    operation: 'create',
    entityIds: mealOrderingProductSpec.screens.map((screen) => screen.id),
    payload,
    payloadHash: hashConnectorPayload(payload),
    status: 'approved',
  }
}

describe('MockFigmaArtifactConnector parity', () => {
  it('executes idempotently, reads independently and verifies metadata', async () => {
    const connector = new MockFigmaArtifactConnector(syntheticZaloDesignSystem, target, {
      now: () => '2026-07-22T01:00:00.000Z',
    })
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
      runId: 'RUN-TEST', threadId: 'THREAD-TEST', actionId: 'action:figma:test', idempotencyKey: 'figma:RUN-TEST:v1',
    })
    const preflight = await connector.preflight(plan)
    const action = approvedAction(preflight.planHash)

    const first = await connector.execute(action, preflight)
    const second = await connector.execute(action, preflight)
    const snapshot = await connector.readBack(first)
    const verified = await connector.verify(preflight.plan, snapshot)

    expect(second.externalId).toBe(first.externalId)
    expect(connector.artifactCount()).toBe(1)
    expect(verified).toEqual({ verified: true, issues: [] })
  })

  it('rejects unapproved writes and detects read-back metadata mismatch', async () => {
    const connector = new MockFigmaArtifactConnector(syntheticZaloDesignSystem, target)
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
      runId: 'RUN-TEST', threadId: 'THREAD-TEST', actionId: 'action:figma:test', idempotencyKey: 'figma:RUN-TEST:v1',
    })
    const preflight = await connector.preflight(plan)
    const action = approvedAction(preflight.planHash)
    await expect(connector.execute({ ...action, status: 'pending_approval' }, preflight)).rejects.toMatchObject({ code: 'POLICY_REJECTED' })

    const receipt = await connector.execute(action, preflight)
    connector.tamper(receipt.idempotencyKey, (snapshot) => ({
      ...snapshot,
      screens: snapshot.screens.map((screen, index) => index === 0
        ? { ...screen, metadata: { ...screen.metadata, requirementIds: ['REQ-WRONG'] } }
        : screen),
    }))
    const verification = await connector.verify(preflight.plan, await connector.readBack(receipt))
    expect(verification.verified).toBe(false)
    expect(verification.issues.map((issue) => issue.code)).toContain('REQUIREMENT_METADATA_MISMATCH')
  })
})
