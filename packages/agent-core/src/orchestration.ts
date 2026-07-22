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
): RunState {
  const result = parsePhaseReasoningResult(decisionResult, 'decide')
  if (result.phase !== 'decide' || !result.phaseData.options.some((option) => option.id === optionId)) {
    throw new Error(`Decision option does not exist: ${optionId}`)
  }
  return transitionRunState(state, 'SELECT_OPTION', selectedAt)
}
