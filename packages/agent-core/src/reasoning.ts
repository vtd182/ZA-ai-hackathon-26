import {
  parsePhaseReasoningResult,
  providerEventSchema,
  type PhaseReasoningResult,
  type ProviderEvent,
  type RunState,
  type WorkflowView,
} from '@pm-agent/domain'

export interface AcceptedReasoningProposal {
  state: RunState
  result: PhaseReasoningResult
}

export interface AcceptedProviderEvents extends AcceptedReasoningProposal {
  text: string
  usage: { inputTokens: number; outputTokens: number } | null
}

export function acceptReasoningProposal(
  state: RunState,
  untrustedResult: unknown,
  expectedPhase: WorkflowView,
): AcceptedReasoningProposal {
  const result = parsePhaseReasoningResult(untrustedResult, expectedPhase)
  return { state, result }
}

export function acceptCompletedProviderEvents(
  state: RunState,
  untrustedEvents: unknown[],
  expectedPhase: WorkflowView,
): AcceptedProviderEvents {
  const events = untrustedEvents.map((event) => providerEventSchema.parse(event))
  events.forEach((event, index) => {
    if (event.sequence !== index) throw new Error(`Provider event sequence is not contiguous at ${index}`)
  })
  if (events.some((event) => event.type === 'turn_failed' || event.type === 'turn_cancelled')) {
    throw new Error('Provider turn did not complete successfully')
  }
  if (events.at(-1)?.type !== 'turn_completed') throw new Error('Provider event stream is incomplete')
  const resultEvents = events.filter((event): event is Extract<ProviderEvent, { type: 'result' }> => event.type === 'result')
  if (resultEvents.length !== 1) throw new Error('Provider event stream must contain exactly one canonical result')
  const accepted = acceptReasoningProposal(state, resultEvents[0]!.result, expectedPhase)
  const usageEvent = [...events].reverse().find(
    (event): event is Extract<ProviderEvent, { type: 'usage' }> => event.type === 'usage',
  )
  return {
    ...accepted,
    text: events.filter((event): event is Extract<ProviderEvent, { type: 'text_delta' }> => event.type === 'text_delta').map((event) => event.delta).join(''),
    usage: usageEvent ? { inputTokens: usageEvent.inputTokens, outputTokens: usageEvent.outputTokens } : null,
  }
}
