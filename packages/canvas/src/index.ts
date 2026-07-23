import { canvasProgramSchema, parseProductSpec, type CanvasDocumentContext, type CanvasProgram, type CanvasSelectionContext, type ChatMessage, type EntityKind, type ProductSpec, type ProviderCommand, type WorkflowView } from '@pm-agent/domain'

export * from './scene-layout'

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

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

function stableId(value: string, index: number): string {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || `step-${index + 1}`
}

function requestedWorkflowSteps(message: string): string[] {
  const match = message.match(/(?:bao\s+gồm|gồm|including)\s+(.+?)(?:[.!?]|$)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(/\s*,\s*|\s+và\s+|\s+and\s+/i)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export type CanvasInteractionKind = 'conversation' | 'draw' | 'edit' | 'clarify_edit' | 'promote'

export interface CanvasInteractionDecision {
  kind: CanvasInteractionKind
  selection?: CanvasSelectionContext
}

function selectionForMention(message: string, canvas?: CanvasDocumentContext): CanvasSelectionContext | undefined {
  if (!canvas) return undefined
  const normalized = normalizeText(message)
  const shape = canvas.shapes.find((item) => {
    const semanticId = item.semanticId ? normalizeText(item.semanticId) : ''
    const label = normalizeText(item.label)
    return (semanticId.length >= 3 && normalized.includes(semanticId))
      || (label.length >= 3 && normalized.includes(label))
  })
  if (!shape) return undefined
  return {
    entityId: shape.semanticId ?? shape.id,
    label: shape.label || shape.semanticId || shape.type,
    shapeIds: [shape.id],
    selectedShapeCount: 1,
    contextItems: [{ shapeId: shape.id, ...(shape.semanticId ? { entityId: shape.semanticId } : {}), type: shape.type, label: shape.label }],
  }
}

export function classifyCanvasInteraction(
  message: string,
  selection?: CanvasSelectionContext,
  canvas?: CanvasDocumentContext,
): CanvasInteractionDecision {
  const normalized = normalizeText(message)
  if (/(chot|xac nhan|promote).*(flow|canvas|mvp|productspec)|chot flow/.test(normalized)) return { kind: 'promote' }

  const explicitDraw = /(ve|draw|phac thao|tao|lap|cho toi|hien thi).{0,36}(workflow|user flow|flow|so do|prototype|wireframe|mindmap|ban do)/.test(normalized)
    || /(workflow|user flow|flow|so do|prototype).{0,28}(day du|toan bo)/.test(normalized)
  if (explicitDraw) return { kind: 'draw' }

  const editIntent = /(tao them|them|sua|doi|xoa|mo rong|cap nhat|bo sung|thu lai|retry|nhanh loi|error)/.test(normalized)
  if (!editIntent) return { kind: 'conversation' }
  const resolvedSelection = selection ?? selectionForMention(message, canvas)
  return resolvedSelection ? { kind: 'edit', selection: resolvedSelection } : { kind: 'clarify_edit' }
}

export interface CanvasPlanningContext {
  recentMessages?: ChatMessage[]
  canvas?: CanvasDocumentContext
}

function operationsProgram(summary: string, nodes: Array<{ id: string; label: string; kind: 'note' | 'process' | 'decision' | 'screen'; x?: number; y?: number }>, connections: Array<{ fromId: string; toId: string; label?: string }>): CanvasProgram {
  return canvasProgramSchema.parse({
    schemaVersion: 1,
    mode: 'operations',
    summary,
    operations: [
      ...nodes.map((node) => ({ op: 'create_node' as const, id: node.id, label: node.label, kind: node.kind })),
      ...connections.map((connection, index) => ({ op: 'connect' as const, id: `edge-${connection.fromId}-${connection.toId}-${index + 1}`, ...connection })),
    ],
    script: null,
  })
}

function rideBookingWorkflow(): CanvasProgram {
  const nodes = [
    { id: 'mo-ung-dung', label: 'Mở Mini App', kind: 'screen' as const, x: 0, y: 0 },
    { id: 'quyen-vi-tri', label: 'Cho phép truy cập vị trí', kind: 'decision' as const, x: 320, y: 0 },
    { id: 'chon-diem-don', label: 'Chọn điểm đón', kind: 'screen' as const, x: 640, y: 0 },
    { id: 'chon-diem-den', label: 'Chọn điểm đến', kind: 'screen' as const, x: 960, y: 0 },
    { id: 'chon-loai-xe', label: 'Chọn loại xe', kind: 'screen' as const, x: 1_280, y: 0 },
    { id: 'xem-gia', label: 'Xem giá dự kiến', kind: 'process' as const, x: 1_280, y: 220 },
    { id: 'xac-nhan-chuyen', label: 'Xác nhận chuyến', kind: 'decision' as const, x: 960, y: 220 },
    { id: 'tim-tai-xe', label: 'Tìm tài xế', kind: 'process' as const, x: 640, y: 220 },
    { id: 'co-tai-xe', label: 'Đã tìm thấy tài xế?', kind: 'decision' as const, x: 320, y: 220 },
    { id: 'theo-doi-tai-xe', label: 'Theo dõi tài xế đến đón', kind: 'screen' as const, x: 0, y: 220 },
    { id: 'dang-di-chuyen', label: 'Đang trong chuyến đi', kind: 'process' as const, x: 0, y: 440 },
    { id: 'thanh-toan', label: 'Thanh toán', kind: 'screen' as const, x: 320, y: 440 },
    { id: 'hoan-tat', label: 'Hoàn tất chuyến đi', kind: 'screen' as const, x: 640, y: 440 },
    { id: 'danh-gia', label: 'Đánh giá chuyến đi', kind: 'screen' as const, x: 960, y: 440 },
    { id: 'tu-choi-vi-tri', label: 'Hướng dẫn bật quyền vị trí', kind: 'note' as const, x: 320, y: -220 },
    { id: 'khong-co-tai-xe', label: 'Không tìm thấy tài xế', kind: 'note' as const, x: 320, y: 660 },
    { id: 'huy-chuyen', label: 'Hủy chuyến', kind: 'note' as const, x: -320, y: 220 },
    { id: 'thanh-toan-loi', label: 'Thanh toán thất bại / thử lại', kind: 'note' as const, x: 320, y: 660 },
  ]
  const pairs: Array<[string, string, string?]> = [
    ['mo-ung-dung', 'quyen-vi-tri'],
    ['quyen-vi-tri', 'chon-diem-don', 'Đồng ý'],
    ['quyen-vi-tri', 'tu-choi-vi-tri', 'Từ chối'],
    ['chon-diem-don', 'chon-diem-den'],
    ['chon-diem-den', 'chon-loai-xe'],
    ['chon-loai-xe', 'xem-gia'],
    ['xem-gia', 'xac-nhan-chuyen'],
    ['xac-nhan-chuyen', 'tim-tai-xe', 'Xác nhận'],
    ['tim-tai-xe', 'co-tai-xe'],
    ['co-tai-xe', 'theo-doi-tai-xe', 'Có'],
    ['co-tai-xe', 'khong-co-tai-xe', 'Không'],
    ['khong-co-tai-xe', 'tim-tai-xe', 'Thử lại'],
    ['theo-doi-tai-xe', 'dang-di-chuyen'],
    ['theo-doi-tai-xe', 'huy-chuyen'],
    ['dang-di-chuyen', 'thanh-toan'],
    ['thanh-toan', 'hoan-tat', 'Thành công'],
    ['thanh-toan', 'thanh-toan-loi', 'Thất bại'],
    ['thanh-toan-loi', 'thanh-toan', 'Thử lại'],
    ['hoan-tat', 'danh-gia'],
  ]
  return operationsProgram(
    'Flow đặt xe đầy đủ gồm happy path và các nhánh ngoại lệ chính',
    nodes,
    pairs.map(([fromId, toId, label]) => ({ fromId, toId, ...(label ? { label } : {}) })),
  )
}

function genericFullWorkflow(context: CanvasPlanningContext): CanvasProgram {
  const topic = context.recentMessages
    ?.filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join(' ')
    .slice(0, 180) || 'sản phẩm'
  const nodes = [
    { id: 'bat-dau', label: `Bắt đầu: ${topic}`, kind: 'note' as const },
    { id: 'nhap-thong-tin', label: 'Nhập thông tin', kind: 'screen' as const },
    { id: 'kiem-tra', label: 'Kiểm tra dữ liệu', kind: 'decision' as const },
    { id: 'xac-nhan', label: 'Xác nhận', kind: 'screen' as const },
    { id: 'xu-ly', label: 'Xử lý yêu cầu', kind: 'process' as const },
    { id: 'ket-qua', label: 'Thông báo kết quả', kind: 'screen' as const },
    { id: 'loi', label: 'Hiển thị lỗi và thử lại', kind: 'note' as const },
  ]
  return operationsProgram('Bản nháp flow đầy đủ từ ngữ cảnh hội thoại', nodes, [
    { fromId: 'bat-dau', toId: 'nhap-thong-tin' },
    { fromId: 'nhap-thong-tin', toId: 'kiem-tra' },
    { fromId: 'kiem-tra', toId: 'xac-nhan', label: 'Hợp lệ' },
    { fromId: 'kiem-tra', toId: 'loi', label: 'Không hợp lệ' },
    { fromId: 'loi', toId: 'nhap-thong-tin', label: 'Thử lại' },
    { fromId: 'xac-nhan', toId: 'xu-ly' },
    { fromId: 'xu-ly', toId: 'ket-qua' },
  ])
}

function prototypeScreens(message: string, context: CanvasPlanningContext): CanvasProgram {
  const conversation = context.recentMessages?.map((item) => item.content).join(' ') ?? ''
  const topic = normalizeText(`${conversation} ${message}`)
  const screens = /(suat an|dat mon|meal|ordering|pantry|com trua)/.test(topic)
    ? [
        ['prototype-discover-meals', 'Khám phá món ăn'],
        ['prototype-choose-meal', 'Chọn món & khung giờ'],
        ['prototype-cart', 'Giỏ hàng'],
        ['prototype-confirm-order', 'Xác nhận đơn'],
        ['prototype-order-status', 'Trạng thái nhận hàng'],
      ]
    : /(dat xe|goi xe|booking xe|ride)/.test(topic)
      ? [
          ['prototype-pickup', 'Chọn điểm đón'],
          ['prototype-ride-option', 'Chọn loại chuyến'],
          ['prototype-confirm-ride', 'Xác nhận chuyến'],
          ['prototype-track-driver', 'Theo dõi tài xế'],
        ]
      : /(onboarding|dang ky|xac thuc|otp)/.test(topic)
        ? [
            ['prototype-welcome', 'Chào mừng'],
            ['prototype-register', 'Đăng ký'],
            ['prototype-verify', 'Xác thực'],
            ['prototype-complete', 'Hoàn tất'],
          ]
        : [
            ['prototype-home', 'Trang chủ'],
            ['prototype-input', 'Nhập thông tin'],
            ['prototype-review', 'Kiểm tra & xác nhận'],
            ['prototype-complete', 'Hoàn tất'],
          ]
  return operationsProgram(
    `Prototype low-fidelity ${screens.length} màn hình có thể chỉnh sửa trực tiếp`,
    screens.map(([id, label]) => ({ id: id!, label: label!, kind: 'screen' as const })),
    screens.slice(1).map(([id], index) => ({
      fromId: screens[index]![0]!,
      toId: id!,
      label: 'Tiếp tục',
    })),
  )
}

export function planExplicitCanvasRequest(message: string, selection?: CanvasSelectionContext, context: CanvasPlanningContext = {}): CanvasProgram | undefined {
  const normalized = normalizeText(message)
  const drawIntent = classifyCanvasInteraction(message, selection).kind === 'draw'
  if (drawIntent) {
    const prototypeIntent = /(prototype|wireframe)/.test(normalized)
      || (!/(workflow|user flow|flow)/.test(normalized) && /(ve|phac thao|tao).{0,28}man hinh/.test(normalized))
    if (prototypeIntent) return prototypeScreens(message, context)
    const steps = requestedWorkflowSteps(message)
    if (steps.length < 2) {
      const conversation = context.recentMessages?.map((item) => item.content).join(' ') ?? ''
      return /(dat xe|goi xe|booking xe|ride)/.test(normalizeText(`${conversation} ${message}`))
        ? rideBookingWorkflow()
        : genericFullWorkflow(context)
    }
    const ids = steps.map(stableId)
    const operations: CanvasProgram['operations'] = steps.map((label, index) => ({
      op: 'create_node',
      id: ids[index]!,
      label,
      kind: /màn hình|screen|hoàn tất|success/i.test(label) ? 'screen' : /quyết định|decision|\?/i.test(label) ? 'decision' : 'process',
    }))
    for (let index = 1; index < ids.length; index += 1) {
      operations.push({ op: 'connect', id: `edge-${ids[index - 1]}-${ids[index]}`, fromId: ids[index - 1]!, toId: ids[index]! })
    }
    return canvasProgramSchema.parse({ schemaVersion: 1, mode: 'operations', summary: `Workflow ${steps.join(' -> ')}`, operations, script: null })
  }

  const selectedId = selection?.entityId
  if (selectedId && /(otp|retry|thu lai|loi|error|nhanh|branch)/.test(normalized)) {
    const additions = [
      ...(normalized.includes('otp') ? [{ id: `${selectedId}-otp`, label: 'Nhập OTP', kind: 'screen' as const }] : []),
      ...(/retry|thu lai/.test(normalized) ? [{ id: `${selectedId}-retry`, label: 'Thử lại', kind: 'process' as const }] : []),
      ...(/loi|error/.test(normalized) ? [{ id: `${selectedId}-error`, label: `${selection.label} thất bại`, kind: 'note' as const }] : []),
    ]
    if (additions.length === 0) return undefined
    return canvasProgramSchema.parse({
      schemaVersion: 1,
      mode: 'operations',
      summary: `Mở rộng vùng chọn ${selection.label}`,
      operations: additions.flatMap((node) => [
        { op: 'create_node' as const, ...node },
        { op: 'connect' as const, id: `edge-${selectedId}-${node.id}`, fromId: selectedId, toId: node.id },
      ]),
      script: null,
    })
  }
  return undefined
}

export function legacyCommandsToCanvasProgram(commands: ProviderCommand[]): CanvasProgram | undefined {
  const operations: CanvasProgram['operations'] = []
  for (const command of commands) {
    if (command.type === 'create_canvas_node') operations.push({ op: 'create_node', id: command.nodeId, label: command.label, kind: command.nodeKind })
    if (command.type === 'connect_canvas_nodes') operations.push({ op: 'connect', id: `edge-${command.fromId}-${command.toId}`, fromId: command.fromId, toId: command.toId, ...(command.label ? { label: command.label } : {}) })
  }
  return operations.length > 0
    ? canvasProgramSchema.parse({ schemaVersion: 1, mode: 'operations', summary: 'Legacy semantic canvas commands', operations, script: null })
    : undefined
}

export function canvasProgramCovers(program: CanvasProgram, required: CanvasProgram): boolean {
  const labels = new Set(program.operations
    .filter((operation) => operation.op === 'create_node')
    .map((operation) => normalizeText(operation.label)))
  const hasNodes = required.operations
    .filter((operation) => operation.op === 'create_node')
    .every((operation) => labels.has(normalizeText(operation.label)))
  const requiredConnections = required.operations.filter((operation) => operation.op === 'connect').length
  const proposedConnections = program.operations.filter((operation) => operation.op === 'connect').length
  return hasNodes && proposedConnections >= requiredConnections
}

function stableEntityId(prefix: string, value: string, index: number): string {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42)
  return `${prefix}-${slug || index + 1}`
}

export function synthesizeProductSpecFromCanvas(
  current: ProductSpec,
  canvas: CanvasDocumentContext,
  title: string,
  at: string,
): ProductSpec {
  const nodes = canvas.shapes.filter((shape) => shape.type !== 'arrow' && shape.semanticId && shape.nodeKind).slice(0, 40)
  if (nodes.length === 0) throw new Error('Canvas chưa có node có thể promote')
  const requirementIds = nodes.map((shape, index) => stableEntityId('REQ', shape.semanticId || shape.label, index))
  const screens = nodes.map((shape, index) => ({
    id: stableEntityId('SCREEN', shape.semanticId || shape.label, index),
    kind: 'screen' as const,
    title: shape.label || shape.semanticId || `Screen ${index + 1}`,
    purpose: `Represent ${shape.label || shape.semanticId} in the confirmed flow.`,
    requirementIds: [requirementIds[index]!],
    designSystemRoles: ['app-header', 'primary-button'],
  }))
  const stories = nodes.map((shape, index) => ({
    id: stableEntityId('STORY', shape.semanticId || shape.label, index),
    kind: 'story' as const,
    title: `Hoàn thành ${shape.label || shape.semanticId}`,
    requirementIds: [requirementIds[index]!],
    acceptanceCriteria: [`Người dùng hoàn thành bước ${shape.label || shape.semanticId}.`],
  }))
  return parseProductSpec({
    schemaVersion: 1,
    id: current.id,
    version: current.version + 1,
    title: title.trim() || `${nodes[0]!.label || 'Canvas'} workflow`,
    status: 'draft',
    idea: {
      ...current.idea,
      title: title.trim() || nodes[0]!.label || 'Canvas workflow',
      summary: `ProductSpec promoted from ${nodes.length} canvas nodes with explicit user confirmation.`,
    },
    goals: current.goals.length > 0 ? current.goals : [{ id: 'GOAL-COMPLETE-FLOW', kind: 'goal', title: 'Hoàn thành flow', metric: 'Người dùng đi hết flow đã xác nhận.' }],
    findings: current.findings,
    requirements: nodes.map((shape, index) => ({
      id: requirementIds[index]!,
      kind: 'requirement' as const,
      title: shape.label || shape.semanticId || `Step ${index + 1}`,
      description: `Support the confirmed canvas step ${shape.label || shape.semanticId}.`,
      priority: 'must' as const,
      status: 'in_scope' as const,
      acceptanceCriteria: [`Bước ${shape.label || shape.semanticId} xuất hiện và có thể hoàn tất trong flow.`],
      dependsOn: index === 0 ? [] : [requirementIds[index - 1]!],
    })),
    screens,
    stories,
    dependencies: [],
    decisions: [{
      id: `DECISION-CANVAS-V${current.version + 1}`,
      kind: 'decision',
      title: 'Promote canvas flow',
      question: 'Flow nào được chọn làm MVP?',
      choice: nodes.map((shape) => shape.label || shape.semanticId).join(' -> '),
      rationale: 'Người dùng đã review và xác nhận promotion từ canvas.',
      status: 'accepted',
    }],
    relationships: nodes.flatMap((_, index) => [
      { id: `REL-${index + 1}-SCREEN`, type: 'DESIGNED_BY' as const, source: { kind: 'requirement' as const, id: requirementIds[index]! }, target: { kind: 'screen' as const, id: screens[index]!.id } },
      { id: `REL-${index + 1}-STORY`, type: 'IMPLEMENTS' as const, source: { kind: 'requirement' as const, id: requirementIds[index]! }, target: { kind: 'story' as const, id: stories[index]!.id } },
    ]),
    artifactMappings: [],
    createdAt: current.createdAt,
    updatedAt: at,
  })
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
