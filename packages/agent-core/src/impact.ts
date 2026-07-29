import { createHash } from 'node:crypto'
import type { CanvasGestureCommand, ChangeIntent, ChangePreview, EntityKind, PlannedAction, ProductSpec } from '@pm-agent/domain'
import { canvasGestureCommandSchema, parseProductSpec } from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'

export type ImpactPreview = ChangePreview

export type RemovalIntentResolution =
  | { status: 'resolved'; intent: ChangeIntent }
  | { status: 'needs_user_input'; ambiguity: string; candidateEntityIds: string[] }

function normalizeEntityText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function resolveRemovalChangeIntent(
  spec: ProductSpec,
  input: { query: string; reason: string; selectedEntityId?: string },
): RemovalIntentResolution {
  const query = normalizeEntityText(input.query)
  const deictic = /^(cai )?(nay|do)$|^(this|that|selected|selection)$/.test(query)
  const selected = input.selectedEntityId
    ? spec.requirements.find((item) => item.id === input.selectedEntityId)
    : undefined
  const aliasId = /(payment|thanh toan|vi noi bo)/.test(query) ? 'REQ-PAYMENT' : null
  const matches = spec.requirements.filter((requirement) => {
    const id = normalizeEntityText(requirement.id)
    const title = normalizeEntityText(requirement.title)
    return id === query || title === query || (query.length >= 4 && (title.includes(query) || query.includes(title)))
  })
  const target = aliasId
    ? spec.requirements.find((item) => item.id === aliasId)
    : deictic && selected
      ? selected
      : matches.length === 1
        ? matches[0]
        : undefined
  if (target) {
    return {
      status: 'resolved',
      intent: {
        id: `CHANGE-REMOVE-${target.id}-V${spec.version}`,
        operation: 'remove',
        targetEntityId: target.id,
        reason: input.reason,
      },
    }
  }
  const candidates = matches.length > 1
    ? matches.map((item) => item.id)
    : spec.requirements.filter((item) => item.status === 'in_scope').map((item) => item.id)
  return {
    status: 'needs_user_input',
    ambiguity: candidates.length > 0
      ? `Bạn muốn loại requirement nào? Hãy dùng stable ID: ${candidates.join(', ')}.`
      : 'Chưa xác định được requirement cần loại. Hãy nhập stable entity ID.',
    candidateEntityIds: candidates,
  }
}

export function changeIntentFromCanvasCommand(spec: ProductSpec, input: unknown): ChangeIntent {
  const command: CanvasGestureCommand = canvasGestureCommandSchema.parse(input)
  const requirement = spec.requirements.find((item) => item.id === command.entityId)
  if (!requirement) throw new Error(`Canvas remove only supports requirement entities: ${command.entityId}`)
  if (requirement.status !== 'in_scope') throw new Error(`Canvas entity is not removable in its current state: ${command.entityId}`)
  return {
    id: `CHANGE-CANVAS-REMOVE-${command.entityId}-V${spec.version}`,
    operation: 'remove',
    targetEntityId: command.entityId,
    reason: `Canvas delete proposal for ${command.entityId}`,
  }
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

function paymentRemoval(spec: ProductSpec, targetId: string, updatedAt: string): { after: ProductSpec; changes: ChangePreview['changes'] } {
  const target = spec.requirements.find((requirement) => requirement.id === targetId)
  if (!target) throw new Error(`Change target is not a requirement: ${targetId}`)

  const kinds = kindById(spec)
  const relatedIds = new Set<string>([targetId])
  const removesPayment = targetId === 'REQ-PAYMENT'
  if (removesPayment) {
    relatedIds.add(spec.idea.id)
    spec.decisions
      .filter((decision) => /payment|thanh toán|ví nội bộ/i.test(`${decision.question} ${decision.choice}`))
      .forEach((decision) => relatedIds.add(decision.id))
  }
  for (const edge of spec.relationships) {
    if (edge.source.id === targetId && ['IMPLEMENTS', 'DESIGNED_BY', 'DEPENDS_ON', 'AFFECTS'].includes(edge.type)) {
      relatedIds.add(edge.target.id)
    }
  }

  const screens = spec.screens.map((screen) => {
    const requirementIds = screen.requirementIds.filter((id) => id !== targetId)
    if (targetId !== 'REQ-PAYMENT' || requirementIds.length === 0) return { ...screen, requirementIds }
    return {
      ...screen,
      purpose: screen.id === 'SCREEN-CHECKOUT'
        ? 'Kiểm tra đơn trước khi xác nhận'
        : screen.purpose,
      requirementIds,
      designSystemRoles: screen.designSystemRoles.filter((role) => role !== 'payment-method'),
    }
  })
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
    status: spec.status === 'approved' ? 'approved' : 'draft',
    idea: removesPayment
      ? {
          ...spec.idea,
          summary: 'Nhân viên đặt món trước và nhận theo mã tại pantry, giảm thời gian chờ trong giờ cao điểm.',
        }
      : spec.idea,
    requirements: spec.requirements.map((requirement) => requirement.id === targetId
      ? { ...requirement, status: 'removed', priority: 'wont' }
      : { ...requirement, dependsOn: requirement.dependsOn.filter((id) => id !== targetId) }),
    screens: screens.filter((screen) => !removedIds.has(screen.id)),
    stories: stories.filter((story) => !removedIds.has(story.id)),
    dependencies: dependencies.filter((dependency) => !removedIds.has(dependency.id)),
    decisions: spec.decisions.map((decision) => (
      removesPayment && relatedIds.has(decision.id)
        ? {
            ...decision,
            choice: 'MVP chưa gồm thanh toán ví nội bộ.',
            rationale: 'Hoãn payment để tập trung vào luồng đặt món và nhận tại pantry.',
          }
        : decision
    )),
    relationships: spec.relationships.filter((edge) => !removedIds.has(edge.source.id) && !removedIds.has(edge.target.id)),
    artifactMappings: spec.artifactMappings.map((mapping) => mapping.entityIds.some((id) => relatedIds.has(id)) ? { ...mapping, status: 'stale' } : mapping),
    updatedAt,
  })

  const changes = [...relatedIds].sort().map((entityId): ChangePreview['changes'][number] => {
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
