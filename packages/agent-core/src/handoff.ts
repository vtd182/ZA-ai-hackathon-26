import type { ExecutionSummary, HandoffPackage, ProviderProfile, RunState, ThreadDetail } from '@pm-agent/domain'

export function assertProviderSwitchAllowed(input: {
  activeTurn: boolean
  execution: ExecutionSummary | null
  targetCostMode: ProviderProfile['costMode']
  confirmedPaid: boolean
}): void {
  if (input.activeTurn) throw new Error('Cannot switch provider while a turn is active')
  if (input.execution?.actions.some((action) => action.status === 'executing' || action.status === 'verifying')) {
    throw new Error('Cannot switch provider while an artifact write is active')
  }
  if (input.targetCostMode === 'api_paid' && !input.confirmedPaid) {
    throw new Error('PAID_PROVIDER_CONFIRMATION_REQUIRED')
  }
}

export function createHandoffPackage(input: {
  thread: ThreadDetail
  state: RunState
  toProfileId: string
  toModelId: string
  createdAt: string
}): HandoffPackage {
  return {
    schemaVersion: 1,
    threadId: input.thread.id,
    from: { profileId: input.thread.providerId, modelId: input.thread.modelId },
    to: { profileId: input.toProfileId, modelId: input.toModelId },
    productSpec: structuredClone(input.state.productSpec),
    run: {
      id: input.state.id,
      phase: input.state.phase,
      status: input.state.status,
      specVersion: input.state.productSpec.version,
      checkpointAt: input.state.lastCheckpointAt,
    },
    recentMessages: input.thread.messages.slice(-16).map((message) => ({ ...message })),
    pendingActions: input.state.pendingActions.map((action) => structuredClone(action)),
    hasCanvasSnapshot: input.thread.canvasSnapshot !== null,
    createdAt: input.createdAt,
  }
}
