import { createHash } from 'node:crypto'
import type { ChangeIntent, EntityKind, PlannedAction, ProductSpec } from '@pm-agent/domain'
import { parseProductSpec } from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'

export interface ImpactChange {
  entityId: string
  kind: EntityKind
  change: 'removed' | 'updated' | 'affected'
}

export interface ImpactPreview {
  intent: ChangeIntent
  before: ProductSpec
  after: ProductSpec
  affectedEntityIds: string[]
  changes: ImpactChange[]
  actions: PlannedAction[]
}

export function hashActionPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(payload as JsonValue)).digest('hex')
}

function kindById(spec: ProductSpec): Map<string, EntityKind> {
  return new Map([
    [spec.idea.id, spec.idea.kind],
    ...spec.goals.map((entity) => [entity.id, entity.kind] as const),
    ...spec.findings.map((entity) => [entity.id, entity.kind] as const),
    ...spec.requirements.map((entity) => [entity.id, entity.kind] as const),
    ...spec.screens.map((entity) => [entity.id, entity.kind] as const),
    ...spec.stories.map((entity) => [entity.id, entity.kind] as const),
    ...spec.dependencies.map((entity) => [entity.id, entity.kind] as const),
    ...spec.decisions.map((entity) => [entity.id, entity.kind] as const),
  ])
}

function paymentRemoval(spec: ProductSpec, targetId: string, updatedAt: string): { after: ProductSpec; changes: ImpactChange[] } {
  const target = spec.requirements.find((requirement) => requirement.id === targetId)
  if (!target) throw new Error(`Change target is not a requirement: ${targetId}`)

  const kinds = kindById(spec)
  const relatedIds = new Set<string>([targetId])
  for (const edge of spec.relationships) {
    if (edge.source.id === targetId && ['IMPLEMENTS', 'DESIGNED_BY', 'DEPENDS_ON', 'AFFECTS'].includes(edge.type)) {
      relatedIds.add(edge.target.id)
    }
  }

  const screens = spec.screens.map((screen) => ({ ...screen, requirementIds: screen.requirementIds.filter((id) => id !== targetId) }))
  const stories = spec.stories.map((story) => ({ ...story, requirementIds: story.requirementIds.filter((id) => id !== targetId) }))
  const dependencies = spec.dependencies.map((dependency) => ({ ...dependency, requirementIds: dependency.requirementIds.filter((id) => id !== targetId) }))
  const removedIds = new Set<string>([
    targetId,
    ...screens.filter((screen) => screen.requirementIds.length === 0).map((screen) => screen.id),
    ...stories.filter((story) => story.requirementIds.length === 0).map((story) => story.id),
    ...dependencies.filter((dependency) => dependency.requirementIds.length === 0).map((dependency) => dependency.id),
  ])

  const after = parseProductSpec({
    ...structuredClone(spec),
    version: spec.version + 1,
    status: 'draft',
    requirements: spec.requirements.map((requirement) => requirement.id === targetId
      ? { ...requirement, status: 'removed', priority: 'wont' }
      : { ...requirement, dependsOn: requirement.dependsOn.filter((id) => id !== targetId) }),
    screens: screens.filter((screen) => !removedIds.has(screen.id)),
    stories: stories.filter((story) => !removedIds.has(story.id)),
    dependencies: dependencies.filter((dependency) => !removedIds.has(dependency.id)),
    relationships: spec.relationships.filter((edge) => !removedIds.has(edge.source.id) && !removedIds.has(edge.target.id)),
    artifactMappings: spec.artifactMappings.map((mapping) => mapping.entityIds.some((id) => relatedIds.has(id)) ? { ...mapping, status: 'stale' } : mapping),
    updatedAt,
  })

  const changes = [...relatedIds].sort().map((entityId): ImpactChange => {
    const kind = kinds.get(entityId)
    if (!kind) throw new Error(`Impact graph resolved unknown entity: ${entityId}`)
    return { entityId, kind, change: removedIds.has(entityId) ? 'removed' : 'updated' }
  })
  return { after, changes }
}

function action(runId: string, target: PlannedAction['target'], entityIds: string[], payload: Record<string, unknown>): PlannedAction {
  return {
    schemaVersion: 1,
    id: `action:${runId}:${target}`,
    runId,
    target,
    operation: 'update',
    entityIds,
    payload,
    payloadHash: hashActionPayload(payload),
    status: 'pending_approval',
  }
}

export function createImpactPreview(spec: ProductSpec, intent: ChangeIntent, runId: string, updatedAt: string): ImpactPreview {
  if (intent.operation !== 'remove') throw new Error(`Unsupported change operation: ${intent.operation}`)
  const { after, changes } = paymentRemoval(spec, intent.targetEntityId, updatedAt)
  const affectedEntityIds = changes.map((change) => change.entityId)
  const affectedScreens = changes.filter((change) => change.kind === 'screen')
  const affectedStories = changes.filter((change) => change.kind === 'story')

  const actions = [
    action(runId, 'figma', affectedScreens.map((item) => item.entityId), {
      schemaVersion: 1,
      type: 'figma_change_plan',
      specId: spec.id,
      fromVersion: spec.version,
      toVersion: after.version,
      screens: affectedScreens.map((item) => ({ screenId: item.entityId, change: item.change })),
    }),
    action(runId, 'jira', affectedStories.map((item) => item.entityId), {
      schemaVersion: 1,
      type: 'jira_change_plan',
      specId: spec.id,
      fromVersion: spec.version,
      toVersion: after.version,
      stories: affectedStories.map((item) => ({ storyId: item.entityId, change: item.change })),
    }),
    action(runId, 'zdoc', affectedEntityIds, {
      schemaVersion: 1,
      type: 'zdoc_change_plan',
      specId: spec.id,
      fromVersion: spec.version,
      toVersion: after.version,
      changedEntityIds: affectedEntityIds,
    }),
  ]

  return { intent, before: spec, after, affectedEntityIds, changes, actions }
}

