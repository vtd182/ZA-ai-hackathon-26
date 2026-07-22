import type { EntityKind, ProductSpec, WorkflowView } from '@pm-agent/domain'

export type CanvasTone = 'yellow' | 'green' | 'blue' | 'violet' | 'orange' | 'red'

export interface CanvasEntityProjection {
  shapeType: 'pm_entity'
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

export interface CanvasEdgeProjection {
  shapeType: 'pm_traceability_edge'
  relationshipId: string
  relationshipType: ProductSpec['relationships'][number]['type']
  sourceEntityId: string
  targetEntityId: string
  sourceView: WorkflowView
  targetView: WorkflowView
  view: WorkflowView
}

export interface CanvasGraphProjection {
  schemaVersion: 1
  entities: CanvasEntityProjection[]
  edges: CanvasEdgeProjection[]
}

function lane(
  entities: Array<{ id: string; kind: EntityKind; title: string }>,
  view: WorkflowView,
  y: number,
  tone: CanvasTone,
  removedIds: Set<string>,
): CanvasEntityProjection[] {
  return entities.map((entity, index) => ({
    shapeType: 'pm_entity',
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

export function projectProductSpecGraph(spec: ProductSpec): CanvasGraphProjection {
  const entities = projectProductSpec(spec)
  const byId = new Map(entities.map((entity) => [entity.entityId, entity]))
  const edges = spec.relationships.map((relationship): CanvasEdgeProjection => {
    const source = byId.get(relationship.source.id)
    const target = byId.get(relationship.target.id)
    if (!source || !target) throw new Error(`Canvas edge references an unprojected entity: ${relationship.id}`)
    return {
      shapeType: 'pm_traceability_edge',
      relationshipId: relationship.id,
      relationshipType: relationship.type,
      sourceEntityId: source.entityId,
      targetEntityId: target.entityId,
      sourceView: source.view,
      targetView: target.view,
      view: target.view,
    }
  })
  return { schemaVersion: 1, entities, edges }
}
