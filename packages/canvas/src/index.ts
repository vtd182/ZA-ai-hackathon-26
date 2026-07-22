import type { EntityKind, ProductSpec, WorkflowView } from '@pm-agent/domain'

export type CanvasTone = 'yellow' | 'green' | 'blue' | 'violet' | 'orange' | 'red'

export interface CanvasEntityProjection {
  entityId: string
  kind: EntityKind
  label: string
  view: WorkflowView
  x: number
  y: number
  width: number
  height: number
  tone: CanvasTone
  state: 'active' | 'removed' | 'affected'
}

function lane(
  entities: Array<{ id: string; kind: EntityKind; title: string }>,
  view: WorkflowView,
  y: number,
  tone: CanvasTone,
  removedIds: Set<string>,
): CanvasEntityProjection[] {
  return entities.map((entity, index) => ({
    entityId: entity.id,
    kind: entity.kind,
    label: `${entity.id}\n${entity.title}`,
    view,
    x: 80 + index * 250,
    y,
    width: 210,
    height: 140,
    tone,
    state: removedIds.has(entity.id) ? 'removed' : 'active',
  }))
}

export function projectProductSpec(spec: ProductSpec): CanvasEntityProjection[] {
  const removedIds = new Set(spec.requirements.filter((requirement) => requirement.status === 'removed').map((requirement) => requirement.id))
  return [
    ...lane([spec.idea], 'discover', 100, 'yellow', removedIds),
    ...lane(spec.findings, 'discover', 350, 'green', removedIds),
    ...lane(spec.goals, 'discover', 600, 'blue', removedIds),
    ...lane(spec.decisions, 'decide', 100, 'orange', removedIds),
    ...lane(spec.requirements, 'deliver', 100, 'violet', removedIds),
    ...lane(spec.screens, 'deliver', 350, 'blue', removedIds),
    ...lane(spec.stories, 'deliver', 600, 'green', removedIds),
    ...lane(spec.dependencies, 'change', 100, 'red', removedIds),
  ]
}

