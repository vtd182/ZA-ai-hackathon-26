import type { ChangeIntent, PlannedAction, ProductSpec, RunState } from '@pm-agent/domain'

export interface ImpactPreview {
  intent: ChangeIntent
  before: ProductSpec
  after: ProductSpec
  affectedEntityIds: string[]
  actions: PlannedAction[]
}

export interface AgentCore {
  getState(): RunState
  previewChange(intent: ChangeIntent): ImpactPreview
}

