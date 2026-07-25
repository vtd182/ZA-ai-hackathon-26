import type { RunState } from './lifecycle'

export type WorkflowEvent =
  | 'START_DISCOVERY'
  | 'REQUEST_DECISION'
  | 'SELECT_OPTION'
  | 'REQUEST_CHANGE'
  | 'PREVIEW_READY'
  | 'NEEDS_INPUT'
  | 'PROVIDE_INPUT'
  | 'APPROVE'
  | 'REJECT'
  | 'START_EXECUTION'
  | 'START_VERIFICATION'
  | 'VERIFY_SUCCESS'
  | 'PARTIAL_FAILURE'
  | 'RETRY_EXECUTION'
  | 'REPREPARE_ARTIFACT'

interface StateKey {
  phase: RunState['phase']
  status: RunState['status']
}

const transitions: Record<string, StateKey> = {
  'IDEA_INTAKE:ACTIVE:START_DISCOVERY': { phase: 'DISCOVERY', status: 'ACTIVE' },
  'DISCOVERY:ACTIVE:REQUEST_DECISION': { phase: 'DECISION', status: 'WAITING_FOR_DECISION' },
  'DECISION:WAITING_FOR_DECISION:SELECT_OPTION': { phase: 'DELIVERY', status: 'ACTIVE' },
  'DELIVERY:WAITING_FOR_APPROVAL:APPROVE': { phase: 'DELIVERY', status: 'ACTIVE' },
  'DELIVERY:WAITING_FOR_APPROVAL:REJECT': { phase: 'DELIVERY', status: 'ACTIVE' },
  'DELIVERY:ACTIVE:START_EXECUTION': { phase: 'DELIVERY', status: 'EXECUTING' },
  'DELIVERY:EXECUTING:START_VERIFICATION': { phase: 'DELIVERY', status: 'VERIFYING' },
  'DELIVERY:VERIFYING:VERIFY_SUCCESS': { phase: 'DELIVERY', status: 'COMPLETED' },
  'DELIVERY:EXECUTING:PARTIAL_FAILURE': { phase: 'DELIVERY', status: 'PARTIAL_FAILURE' },
  'DELIVERY:PARTIAL_FAILURE:RETRY_EXECUTION': { phase: 'DELIVERY', status: 'EXECUTING' },
  'DELIVERY:PARTIAL_FAILURE:REPREPARE_ARTIFACT': { phase: 'DELIVERY', status: 'WAITING_FOR_APPROVAL' },
  'DELIVERY:ACTIVE:REQUEST_CHANGE': { phase: 'CHANGE_IMPACT', status: 'ACTIVE' },
  'CHANGE_IMPACT:ACTIVE:NEEDS_INPUT': { phase: 'CHANGE_IMPACT', status: 'NEEDS_USER_INPUT' },
  'CHANGE_IMPACT:NEEDS_USER_INPUT:PROVIDE_INPUT': { phase: 'CHANGE_IMPACT', status: 'ACTIVE' },
  'CHANGE_IMPACT:ACTIVE:PREVIEW_READY': { phase: 'CHANGE_IMPACT', status: 'WAITING_FOR_APPROVAL' },
  'CHANGE_IMPACT:WAITING_FOR_APPROVAL:APPROVE': { phase: 'CHANGE_IMPACT', status: 'ACTIVE' },
  'CHANGE_IMPACT:WAITING_FOR_APPROVAL:REJECT': { phase: 'DELIVERY', status: 'ACTIVE' },
  'CHANGE_IMPACT:ACTIVE:START_EXECUTION': { phase: 'CHANGE_IMPACT', status: 'EXECUTING' },
  'CHANGE_IMPACT:EXECUTING:START_VERIFICATION': { phase: 'CHANGE_IMPACT', status: 'VERIFYING' },
  'CHANGE_IMPACT:VERIFYING:VERIFY_SUCCESS': { phase: 'DELIVERY', status: 'COMPLETED' },
  'CHANGE_IMPACT:EXECUTING:PARTIAL_FAILURE': { phase: 'CHANGE_IMPACT', status: 'PARTIAL_FAILURE' },
  'CHANGE_IMPACT:PARTIAL_FAILURE:RETRY_EXECUTION': { phase: 'CHANGE_IMPACT', status: 'EXECUTING' },
}

export class InvalidWorkflowTransitionError extends Error {
  constructor(readonly state: StateKey, readonly event: WorkflowEvent) {
    super(`Invalid workflow transition: ${state.phase}/${state.status} -> ${event}`)
    this.name = 'InvalidWorkflowTransitionError'
  }
}

export function transitionRunState(state: RunState, event: WorkflowEvent, checkpointAt: string): RunState {
  const next = transitions[`${state.phase}:${state.status}:${event}`]
  if (!next) throw new InvalidWorkflowTransitionError({ phase: state.phase, status: state.status }, event)
  return { ...state, ...next, lastCheckpointAt: checkpointAt }
}
