import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import type { FigmaTargetBinding, PlannedAction } from '@pm-agent/domain'
import { createFigmaArtifactPlan } from './figma-artifact-plan'
import { hashConnectorPayload, MockFigmaArtifactConnector } from './figma-connector'
import { defineArtifactConnectorContractTests } from './connector-contract.test-kit'

const target: FigmaTargetBinding = {
  schemaVersion: 1,
  targetHash: 'c'.repeat(64),
  sessionId: 'mock:contract',
  fileName: 'Mock sandbox',
  pageId: '0:1',
  pageName: 'Demo',
  allowedAt: '2026-07-22T00:00:00.000Z',
}

defineArtifactConnectorContractTests('Mock Figma', () => {
  const connector = new MockFigmaArtifactConnector(syntheticZaloDesignSystem, target, {
    now: () => '2026-07-22T01:00:00.000Z',
  })
  const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
    runId: 'RUN-CONTRACT',
    threadId: 'THREAD-CONTRACT',
    actionId: 'action:figma:contract',
    idempotencyKey: 'figma:RUN-CONTRACT:v1',
  })
  return {
    connector,
    plan,
    approvedAction: (preflight): PlannedAction => {
      const payload = { schemaVersion: 1, planHash: preflight.planHash }
      return {
        schemaVersion: 1,
        id: 'action:figma:contract',
        runId: 'RUN-CONTRACT',
        target: 'figma',
        operation: 'create',
        entityIds: mealOrderingProductSpec.screens.map((screen) => screen.id),
        payload,
        payloadHash: hashConnectorPayload(payload),
        status: 'approved',
      }
    },
    artifactCount: () => connector.artifactCount(),
    setAvailable: (available) => connector.setAvailable(available),
  }
})
