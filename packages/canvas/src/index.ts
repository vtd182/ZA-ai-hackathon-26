import type { EntityKind, ProductSpec, WorkflowView } from '@pm-agent/domain'

export interface CanvasEntityProjection {
  entityId: string
  kind: EntityKind
  label: string
  view: WorkflowView
  x: number
  y: number
  width: number
  height: number
  state: 'active' | 'removed' | 'affected'
}

export interface ProductSpecProjector {
  project(spec: ProductSpec, view: WorkflowView): CanvasEntityProjection[]
}

