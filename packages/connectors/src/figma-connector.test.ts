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
      designConceptName: 'Wrong concept',
      screens: snapshot.screens.map((screen, index) => index === 0
        ? {
            ...screen,
            archetype: 'form',
            sectionKeys: [],
            metadata: { ...screen.metadata, requirementIds: ['REQ-WRONG'] },
          }
        : screen),
    }))
    const verification = await connector.verify(preflight.plan, await connector.readBack(receipt))
    expect(verification.verified).toBe(false)
    expect(verification.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'DESIGN_CONCEPT_MISMATCH',
      'REQUIREMENT_METADATA_MISMATCH',
      'ARCHETYPE_MISMATCH',
      'SECTION_COVERAGE_MISMATCH',
    ]))
  })

  it('accepts a connector-owned plan hash covered by the exact approved payload', async () => {
    const connector = new MockFigmaArtifactConnector(syntheticZaloDesignSystem, target)
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
      runId: 'RUN-TEST', threadId: 'THREAD-TEST', actionId: 'action:figma:test', idempotencyKey: 'figma:RUN-TEST:v1:external-hash',
    })
    const preflight = await connector.preflight(plan)
    const connectorOwnedHash = 'f'.repeat(64)
    const externalPreflight = { ...preflight, planHash: connectorOwnedHash }
    const action = approvedAction(connectorOwnedHash)

    await expect(connector.execute(action, externalPreflight)).resolves.toMatchObject({
      target: 'figma',
    })
  })
})
