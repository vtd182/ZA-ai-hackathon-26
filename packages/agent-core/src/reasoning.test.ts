import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import type { RunState } from '@pm-agent/domain'
import { acceptReasoningProposal } from './reasoning'

const state: RunState = {
  schemaVersion: 1,
  id: 'RUN-REASONING',
  threadId: 'THREAD-REASONING',
  phase: 'IDEA_INTAKE',
  status: 'ACTIVE',
  productSpec: mealOrderingProductSpec,
  pendingIntent: null,
  pendingActions: [],
  lastCheckpointAt: '2026-07-22T03:00:00.000Z',
}

describe('reasoning proposal boundary', () => {
  it('rejects malformed phase output without mutating canonical state', () => {
    const before = structuredClone(state)
    expect(() => acceptReasoningProposal(state, {
      schemaVersion: 1,
      phase: 'discover',
      message: 'Need questions',
      commands: [],
      phaseData: { questions: [{ id: 'Q1', prompt: 'Who?', options: ['Only one'] }], assumptions: [] },
    }, 'discover')).toThrow()
    expect(state).toEqual(before)
  })

  it('rejects a schema-valid result for the wrong phase', () => {
    expect(() => acceptReasoningProposal(state, {
      schemaVersion: 1,
      phase: 'deliver',
      message: 'Ready',
      commands: [],
      phaseData: { artifactTargets: ['figma'], readinessSummary: 'Ready' },
    }, 'decide')).toThrow()
  })
})
