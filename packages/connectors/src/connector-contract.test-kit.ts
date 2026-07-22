import { describe, expect, it } from 'vitest'
import type { ActionReceipt, PlannedAction } from '@pm-agent/domain'
import type { ArtifactConnector, PreflightResult } from './contract'

export interface ConnectorContractFixture<TPlan, TPreparedPlan, TSnapshot> {
  connector: ArtifactConnector<TPlan, TPreparedPlan, TSnapshot>
  plan: TPlan
  approvedAction(preflight: PreflightResult<TPreparedPlan>): PlannedAction
  artifactCount(): number
  setAvailable(available: boolean): void
}

export function defineArtifactConnectorContractTests<TPlan, TPreparedPlan, TSnapshot>(
  name: string,
  createFixture: () => ConnectorContractFixture<TPlan, TPreparedPlan, TSnapshot>,
): void {
  describe(`${name} connector contract`, () => {
    it('reports typed availability and keeps preflight read-only', async () => {
      const fixture = createFixture()
      await expect(fixture.connector.checkAvailability()).resolves.toMatchObject({ available: true })
      const before = fixture.artifactCount()
      const preflight = await fixture.connector.preflight(fixture.plan)
      expect(preflight.allowed).toBe(true)
      expect(preflight.planHash).toMatch(/^[a-f0-9]{64}$/)
      expect(fixture.artifactCount()).toBe(before)
    })

    it('rejects an action that is not approved', async () => {
      const fixture = createFixture()
      const preflight = await fixture.connector.preflight(fixture.plan)
      const action = fixture.approvedAction(preflight)
      await expect(fixture.connector.execute({ ...action, status: 'pending_approval' }, preflight))
        .rejects.toMatchObject({ code: 'POLICY_REJECTED', retryable: false })
      expect(fixture.artifactCount()).toBe(0)
    })

    it('is idempotent and verifies from an independent read-back', async () => {
      const fixture = createFixture()
      const preflight = await fixture.connector.preflight(fixture.plan)
      const action = fixture.approvedAction(preflight)
      const first: ActionReceipt = await fixture.connector.execute(action, preflight)
      const second: ActionReceipt = await fixture.connector.execute(action, preflight)
      expect(second.externalId).toBe(first.externalId)
      expect(second.idempotencyKey).toBe(first.idempotencyKey)
      expect(fixture.artifactCount()).toBe(1)

      const snapshot = await fixture.connector.readBack(first)
      await expect(fixture.connector.verify(preflight.plan, snapshot)).resolves.toMatchObject({ verified: true, issues: [] })
    })

    it('normalizes unavailable execution as retryable without creating an artifact', async () => {
      const fixture = createFixture()
      const preflight = await fixture.connector.preflight(fixture.plan)
      fixture.setAvailable(false)
      await expect(fixture.connector.execute(fixture.approvedAction(preflight), preflight))
        .rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true })
      expect(fixture.artifactCount()).toBe(0)
    })
  })
}
