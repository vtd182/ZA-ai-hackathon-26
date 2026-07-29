import { describe, expect, it } from 'vitest'
import { createArtifactBrief, type ArtifactBrief, type ExecutionSummary, type PlannedAction } from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { hashConnectorPayload } from '@pm-agent/connectors'
import { buildArtifactContractExport, renderArtifactContractsMarkdown } from './export-bundle'

const at = '2026-07-30T00:00:00.000Z'
const sourcePayloadHash = hashConnectorPayload(mealOrderingProductSpec as unknown as Record<string, unknown>)

function brief(target: 'figma' | 'jira' | 'zdoc'): ArtifactBrief {
  return createArtifactBrief({
    spec: mealOrderingProductSpec,
    target,
    sourcePayloadHash,
    createdAt: at,
    ...(target === 'figma'
      ? {
          figma: {
            connectorMode: 'live' as const,
            planMode: 'free' as const,
            pageStrategy: 'use_target_page' as const,
          },
        }
      : {}),
  })
}

function action(target: PlannedAction['target']): PlannedAction {
  const payload = {
    schemaVersion: 1,
    type: `${target}_plan`,
    planHash: `${target}-plan-hash`,
    artifactBrief: brief(target),
  }
  return {
    schemaVersion: 1,
    id: `action:${target}:export`,
    runId: 'RUN-EXPORT',
    target,
    operation: 'create',
    entityIds: ['REQ-1'],
    payload,
    payloadHash: hashConnectorPayload(payload),
    status: 'approved',
  }
}

describe('artifact contract export', () => {
  it('summarizes package-wide ArtifactBriefs and execution read-back state', () => {
    const actions = [action('figma'), action('jira'), action('zdoc')]
    const execution = {
      runId: 'RUN-EXPORT',
      status: 'verified',
      actions: actions.map((item) => ({
        actionId: item.id,
        target: item.target,
        status: 'verified' as const,
        attempts: 1,
        lastError: null,
        receipt: {
          schemaVersion: 1,
          id: `receipt:${item.id}`,
          actionId: item.id,
          target: item.target,
          externalId: `EXT-${item.target}`,
          payloadHash: item.payloadHash,
          idempotencyKey: `${item.target}:RUN-EXPORT:v1`,
          recordedAt: at,
        },
        verification: {
          schemaVersion: 1,
          actionId: item.id,
          verified: true,
          issues: [],
          verifiedAt: at,
        },
      })),
    } satisfies ExecutionSummary

    const summary = buildArtifactContractExport(actions, execution)

    expect(summary.sourceHashAligned).toBe(true)
    expect(summary.sourcePayloadHash).toBe(sourcePayloadHash)
    expect(summary.targets.map((target) => target.target)).toEqual(['figma', 'jira', 'zdoc'])
    expect(summary.targets.every((target) => target.externalId?.startsWith('EXT-'))).toBe(true)
    expect(summary.targets.every((target) => target.verified === true)).toBe(true)
    expect(renderArtifactContractsMarkdown(summary)).toContain('Backlog mock')
    expect(renderArtifactContractsMarkdown(summary)).toContain(sourcePayloadHash)
  })

  it('flags mixed ProductSpec hashes instead of pretending the package is aligned', () => {
    const figma = action('figma')
    const jira = action('jira')
    jira.payload.artifactBrief = { ...brief('jira'), sourcePayloadHash: 'f'.repeat(64) }

    const summary = buildArtifactContractExport([figma, jira], null)

    expect(summary.sourceHashAligned).toBe(false)
    expect(summary.sourcePayloadHash).toBeNull()
    expect(summary.targets).toHaveLength(2)
  })
})
