import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import type { RunState } from '@pm-agent/domain'
import { acceptCompletedProviderEvents, acceptReasoningProposal } from './reasoning'

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

  it('keeps canonical state unchanged for partial or malformed event streams', () => {
    const before = structuredClone(state)
    const at = '2026-07-22T03:01:00.000Z'
    expect(() => acceptCompletedProviderEvents(state, [
      { type: 'turn_started', sequence: 0, at },
      { type: 'text_delta', sequence: 1, at, delta: 'partial' },
    ], 'discover')).toThrow(/incomplete/)
    expect(() => acceptCompletedProviderEvents(state, [
      { type: 'turn_started', sequence: 1, at },
      { type: 'turn_completed', sequence: 2, at },
    ], 'discover')).toThrow(/sequence/)
    expect(state).toEqual(before)
  })
})
