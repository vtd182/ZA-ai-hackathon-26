import {
  parsePhaseReasoningResult,
  transitionRunState,
  type PhaseReasoningResult,
  type RunState,
} from '@pm-agent/domain'

export interface ReasoningCheckpoint {
  schemaVersion: 1
  runId: string
  phase: PhaseReasoningResult['phase']
  result: PhaseReasoningResult
  createdAt: string
}

export const customDecisionOptionId = 'CUSTOM'

type ClarificationQuestion = Extract<PhaseReasoningResult, { phase: 'discover' }>['phaseData']['questions'][number]

export function normalizeClarificationAnswers(
  questions: ClarificationQuestion[],
  answers: Record<string, string>,
): Record<string, string> {
  if (questions.length === 0) throw new Error('Discovery checkpoint không có clarification')
  const normalized: Record<string, string> = {}
  for (const question of questions) {
    const answer = answers[question.id]?.trim() ?? ''
    if (answer.length < 1 || answer.length > 240) {
      throw new Error(`Câu trả lời cho ${question.id} phải có từ 1 đến 240 ký tự`)
    }
    normalized[question.id] = answer
  }
  return normalized
}

export function advanceReasoningPhase(
  state: RunState,
  untrustedResult: unknown,
  createdAt: string,
): { state: RunState; checkpoint: ReasoningCheckpoint } {
  const expectedPhase = state.phase === 'IDEA_INTAKE' ? 'discover'
    : state.phase === 'DISCOVERY' ? 'decide'
      : null
  if (!expectedPhase) throw new Error(`Reasoning phase cannot advance from ${state.phase}/${state.status}`)
  const result = parsePhaseReasoningResult(untrustedResult, expectedPhase)
  const event = expectedPhase === 'discover' ? 'START_DISCOVERY' : 'REQUEST_DECISION'
  const next = transitionRunState(state, event, createdAt)
  return {
    state: next,
    checkpoint: { schemaVersion: 1, runId: state.id, phase: result.phase, result, createdAt },
  }
}

export function selectDecisionOption(
  state: RunState,
  decisionResult: unknown,
  optionId: string,
  selectedAt: string,
  customTitle?: string,
): RunState {
  const result = parsePhaseReasoningResult(decisionResult, 'decide')
  const customOption = optionId === customDecisionOptionId
  const normalizedCustomTitle = customTitle?.trim() ?? ''
  const validCustomOption = customOption && normalizedCustomTitle.length >= 2 && normalizedCustomTitle.length <= 200
  if (result.phase !== 'decide'
    || (!validCustomOption && !result.phaseData.options.some((option) => option.id === optionId))) {
    throw new Error(`Decision option does not exist: ${optionId}`)
  }
  return transitionRunState(state, 'SELECT_OPTION', selectedAt)
}
