import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { createArtifactBrief, type ArtifactBrief, type PlannedAction } from '@pm-agent/domain'
import { defineArtifactConnectorContractTests } from './connector-contract.test-kit'
import { hashConnectorPayload } from './figma-connector'
import { SqliteMockArtifactStore } from './mock-artifact-store'
import { createMockJiraPlan, createMockZdocPlan, MockJiraConnector, MockZdocConnector } from './mock-connectors'

const timestamp = '2026-07-22T02:00:00.000Z'

function artifactBrief(target: 'jira' | 'zdoc'): ArtifactBrief {
  return createArtifactBrief({
    spec: mealOrderingProductSpec,
    target,
    sourcePayloadHash: hashConnectorPayload(mealOrderingProductSpec as unknown as Record<string, unknown>),
    createdAt: timestamp,
  })
}

function approvedAction(target: 'jira' | 'zdoc', planHash: string): PlannedAction {
  const payload = { schemaVersion: 1, planHash }
  return {
    schemaVersion: 1,
    id: `action:${target}:contract`,
    runId: 'RUN-CONTRACT',
    target,
    operation: 'create',
    entityIds: target === 'jira'
      ? mealOrderingProductSpec.stories.map((story) => story.id)
      : mealOrderingProductSpec.requirements.map((requirement) => requirement.id),
    payload,
    payloadHash: hashConnectorPayload(payload),
    status: 'approved',
  }
}

defineArtifactConnectorContractTests('Mock Jira', () => {
  const connector = new MockJiraConnector(new SqliteMockArtifactStore(':memory:'), () => timestamp)
  const plan = createMockJiraPlan(mealOrderingProductSpec, {
    runId: 'RUN-CONTRACT', threadId: 'THREAD-CONTRACT', actionId: 'action:jira:contract', idempotencyKey: 'jira:RUN-CONTRACT:v1', artifactBrief: artifactBrief('jira'),
  })
  return {
    connector,
    plan,
    approvedAction: (preflight) => approvedAction('jira', preflight.planHash),
    artifactCount: () => connector.artifactCount(),
    setAvailable: (available) => connector.setAvailable(available),
  }
})

defineArtifactConnectorContractTests('Mock Zdoc', () => {
  const connector = new MockZdocConnector(new SqliteMockArtifactStore(':memory:'), () => timestamp)
  const plan = createMockZdocPlan(mealOrderingProductSpec, {
    runId: 'RUN-CONTRACT', threadId: 'THREAD-CONTRACT', actionId: 'action:zdoc:contract', idempotencyKey: 'zdoc:RUN-CONTRACT:v1', artifactBrief: artifactBrief('zdoc'),
  })
  return {
    connector,
    plan,
    approvedAction: (preflight) => approvedAction('zdoc', preflight.planHash),
    artifactCount: () => connector.artifactCount(),
    setAvailable: (available) => connector.setAvailable(available),
  }
})

const temporaryDirectories: string[] = []
afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('SQLite mock artifact durability and verification', () => {
  it('reopens the Jira external store without duplicating the Epic', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-jira-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'mock.sqlite')
    const plan = createMockJiraPlan(mealOrderingProductSpec, {
      runId: 'RUN-JIRA', threadId: 'THREAD-JIRA', actionId: 'action:jira:durable', idempotencyKey: 'jira:RUN-JIRA:v1', artifactBrief: artifactBrief('jira'),
    })
    const first = new MockJiraConnector(new SqliteMockArtifactStore(filename), () => timestamp)
    const preflight = await first.preflight(plan)
    const action = { ...approvedAction('jira', preflight.planHash), id: 'action:jira:durable', runId: 'RUN-JIRA' }
    const receipt = await first.execute(action, preflight)
    first.close()

    const reopened = new MockJiraConnector(new SqliteMockArtifactStore(filename), () => timestamp)
    const retried = await reopened.execute(action, preflight)
    expect(retried.externalId).toBe(receipt.externalId)
    expect(reopened.artifactCount()).toBe(1)
    reopened.close()
  })

  it('fails Jira verification when acceptance criteria drift', async () => {
    const connector = new MockJiraConnector(new SqliteMockArtifactStore(':memory:'), () => timestamp)
    const plan = createMockJiraPlan(mealOrderingProductSpec, {
      runId: 'RUN-JIRA', threadId: 'THREAD-JIRA', actionId: 'action:jira:verify', idempotencyKey: 'jira:RUN-JIRA:v1', artifactBrief: artifactBrief('jira'),
    })
    const preflight = await connector.preflight(plan)
    const receipt = await connector.execute({ ...approvedAction('jira', preflight.planHash), id: 'action:jira:verify' }, preflight)
    connector.tamper(receipt.idempotencyKey, (snapshot) => ({
      ...snapshot,
      stories: snapshot.stories.map((story, index) => index === 0 ? { ...story, acceptanceCriteria: ['Drifted'] } : story),
    }))
    const verification = await connector.verify(plan, await connector.readBack(receipt))
    expect(verification.verified).toBe(false)
    expect(verification.issues.map((issue) => issue.code)).toContain('STORY_TRACEABILITY_MISMATCH')
    connector.close()
  })

  it('fails Jira verification when the ArtifactBrief drifts', async () => {
    const connector = new MockJiraConnector(new SqliteMockArtifactStore(':memory:'), () => timestamp)
    const plan = createMockJiraPlan(mealOrderingProductSpec, {
      runId: 'RUN-JIRA', threadId: 'THREAD-JIRA', actionId: 'action:jira:brief', idempotencyKey: 'jira:RUN-JIRA:v1', artifactBrief: artifactBrief('jira'),
    })
    const preflight = await connector.preflight(plan)
    const receipt = await connector.execute({ ...approvedAction('jira', preflight.planHash), id: 'action:jira:brief' }, preflight)
    connector.tamper(receipt.idempotencyKey, (snapshot) => ({
      ...snapshot,
      artifactBrief: { ...snapshot.artifactBrief, sourcePayloadHash: 'e'.repeat(64) },
    }))
    const verification = await connector.verify(plan, await connector.readBack(receipt))
    expect(verification.verified).toBe(false)
    expect(verification.issues.map((issue) => issue.code)).toContain('ARTIFACT_BRIEF_MISMATCH')
    connector.close()
  })

  it('fails Zdoc verification when traceability metadata drifts', async () => {
    const connector = new MockZdocConnector(new SqliteMockArtifactStore(':memory:'), () => timestamp)
    const plan = createMockZdocPlan(mealOrderingProductSpec, {
      runId: 'RUN-ZDOC', threadId: 'THREAD-ZDOC', actionId: 'action:zdoc:verify', idempotencyKey: 'zdoc:RUN-ZDOC:v1', artifactBrief: artifactBrief('zdoc'),
    })
    const preflight = await connector.preflight(plan)
    const receipt = await connector.execute({ ...approvedAction('zdoc', preflight.planHash), id: 'action:zdoc:verify' }, preflight)
    connector.tamper(receipt.idempotencyKey, (snapshot) => ({ ...snapshot, traceability: { ...snapshot.traceability, requirementIds: ['REQ-WRONG'] } }))
    const verification = await connector.verify(plan, await connector.readBack(receipt))
    expect(verification.verified).toBe(false)
    expect(verification.issues.map((issue) => issue.code)).toContain('TRACEABILITY_MISMATCH')
    connector.close()
  })

  it('fails Zdoc verification when the ArtifactBrief drifts', async () => {
    const connector = new MockZdocConnector(new SqliteMockArtifactStore(':memory:'), () => timestamp)
    const plan = createMockZdocPlan(mealOrderingProductSpec, {
      runId: 'RUN-ZDOC', threadId: 'THREAD-ZDOC', actionId: 'action:zdoc:brief', idempotencyKey: 'zdoc:RUN-ZDOC:v1', artifactBrief: artifactBrief('zdoc'),
    })
    const preflight = await connector.preflight(plan)
    const receipt = await connector.execute({ ...approvedAction('zdoc', preflight.planHash), id: 'action:zdoc:brief' }, preflight)
    connector.tamper(receipt.idempotencyKey, (snapshot) => ({
      ...snapshot,
      artifactBrief: { ...snapshot.artifactBrief, sourcePayloadHash: 'e'.repeat(64) },
    }))
    const verification = await connector.verify(plan, await connector.readBack(receipt))
    expect(verification.verified).toBe(false)
    expect(verification.issues.map((issue) => issue.code)).toContain('ARTIFACT_BRIEF_MISMATCH')
    connector.close()
  })
})
