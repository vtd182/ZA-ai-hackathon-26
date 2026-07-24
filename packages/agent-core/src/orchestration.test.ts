import { describe, expect, it } from 'vitest'
import { createDraftProductSpec, type PhaseReasoningResult, type RunState } from '@pm-agent/domain'
import { customDecisionOptionId, normalizeClarificationAnswers, selectDecisionOption } from './orchestration'

const at = '2026-07-23T03:00:00.000Z'

const decision: Extract<PhaseReasoningResult, { phase: 'decide' }> = {
  schemaVersion: 1,
  phase: 'decide',
  message: 'Chọn phương án',
  commands: [],
  intent: { kind: 'conversation', target: null, artifactAction: null },
  phaseData: {
    options: [
      { id: 'OPT-1', title: 'Lean MVP', tradeoff: 'Ít scope' },
      { id: 'OPT-2', title: 'Full MVP', tradeoff: 'Nhiều scope' },
    ],
    recommendedOptionId: 'OPT-1',
  },
}

const waitingState: RunState = {
  schemaVersion: 1,
  id: 'RUN-1',
  threadId: 'THREAD-1',
  phase: 'DECISION',
  status: 'WAITING_FOR_DECISION',
  productSpec: createDraftProductSpec('THREAD-1', at),
  pendingIntent: null,
  pendingActions: [],
  lastCheckpointAt: at,
}

describe('guided lifecycle input', () => {
  it('accepts trimmed custom clarification answers without requiring an existing option', () => {
    const questions = [{
      id: 'Q1',
      prompt: 'Khách hàng chính là ai?',
      options: ['Nhân viên', 'Khách hàng'],
    }]
    expect(normalizeClarificationAnswers(questions, { Q1: '  Nhóm vận hành ca đêm  ' })).toEqual({
      Q1: 'Nhóm vận hành ca đêm',
    })
    expect(() => normalizeClarificationAnswers(questions, { Q1: ' ' })).toThrow(/1 đến 240/)
  })

  it('allows a bounded custom decision and still rejects an empty one', () => {
    expect(selectDecisionOption(waitingState, decision, customDecisionOptionId, at, 'MVP cho đội vận hành')).toMatchObject({
      phase: 'DELIVERY',
      status: 'ACTIVE',
    })
    expect(() => selectDecisionOption(waitingState, decision, customDecisionOptionId, at, ' ')).toThrow(/does not exist/)
  })
})
