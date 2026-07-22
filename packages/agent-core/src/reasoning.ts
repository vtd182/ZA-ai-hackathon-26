import {
  parsePhaseReasoningResult,
  type PhaseReasoningResult,
  type RunState,
  type WorkflowView,
} from '@pm-agent/domain'

export interface AcceptedReasoningProposal {
  state: RunState
  result: PhaseReasoningResult
}

export function acceptReasoningProposal(
  state: RunState,
  untrustedResult: unknown,
  expectedPhase: WorkflowView,
): AcceptedReasoningProposal {
  const result = parsePhaseReasoningResult(untrustedResult, expectedPhase)
  return { state, result }
}
