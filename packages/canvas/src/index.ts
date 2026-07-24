import { canvasProgramSchema, parseProductSpec, type CanvasDocumentContext, type CanvasOperation, type CanvasProgram, type CanvasSelectionContext, type ChatMessage, type EntityKind, type ProductSpec, type ProviderCommand, type WorkflowView } from '@pm-agent/domain'

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

function normalizeVietnameseText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('vi').trim()
}

function selectionContextForShape(shape: CanvasDocumentContext['shapes'][number]): CanvasSelectionContext {
  return {
    entityId: shape.semanticId ?? shape.id,
    label: shape.label || shape.semanticId || shape.type,
    shapeIds: [shape.id],
    selectedShapeCount: 1,
    contextItems: [{ shapeId: shape.id, ...(shape.semanticId ? { entityId: shape.semanticId } : {}), type: shape.type, label: shape.label }],
  }
}

export function resolveCanvasSelection(target: string, canvas?: CanvasDocumentContext): CanvasSelectionContext | undefined {
  if (!canvas) return undefined
  const normalizedTarget = normalizeVietnameseText(target)
  const exactMatches = canvas.shapes.filter((item) => {
    const semanticId = item.semanticId ? normalizeVietnameseText(item.semanticId) : ''
    const label = normalizeVietnameseText(item.label)
    return (semanticId.length >= 3 && normalizedTarget.includes(semanticId))
      || (label.length >= 3 && normalizedTarget.includes(label))
  })
  if (exactMatches.length === 1) return selectionContextForShape(exactMatches[0]!)

  const foldedTarget = normalizeText(target)
  const foldedMatches = canvas.shapes.filter((item) => {
    const semanticId = item.semanticId ? normalizeText(item.semanticId) : ''
    const label = normalizeText(item.label)
    return (semanticId.length >= 3 && foldedTarget.includes(semanticId))
      || (label.length >= 3 && foldedTarget.includes(label))
  })
  return foldedMatches.length === 1 ? selectionContextForShape(foldedMatches[0]!) : undefined
}

export interface CanvasPlanningContext {
  recentMessages?: ChatMessage[]
  canvas?: CanvasDocumentContext
  intent?: 'draw' | 'edit'
}

type CanvasNodeInput = Omit<Extract<CanvasOperation, { op: 'create_node' }>, 'op'>

function operationsProgram(
  summary: string,
  nodes: CanvasNodeInput[],
  connections: Array<{ fromId: string; toId: string; label?: string }>,
  scene?: { sceneType: 'workflow' | 'prototype' | 'board'; title: string; description: string },
): CanvasProgram {
  const seenIds = new Set<string>()
  const seenLabels = new Set<string>()
  const uniqueNodes = nodes.filter((node) => {
    const label = normalizeText(node.label).trim()
    if (seenIds.has(node.id) || seenLabels.has(label)) return false
    seenIds.add(node.id)
    seenLabels.add(label)
    return true
  })
  const seenConnections = new Set<string>()
  const uniqueConnections = connections.filter((connection) => {
    if (!seenIds.has(connection.fromId) || !seenIds.has(connection.toId)) return false
    const key = `${connection.fromId}:${connection.toId}:${normalizeText(connection.label ?? '')}`
    if (seenConnections.has(key)) return false
    seenConnections.add(key)
    return true
  })
  return canvasProgramSchema.parse({
    schemaVersion: 1,
    mode: 'operations',
    summary,
    operations: [
      ...uniqueNodes.map((node) => ({ op: 'create_node' as const, ...node })),
      ...uniqueConnections.map((connection, index) => ({ op: 'connect' as const, id: `edge-${connection.fromId}-${connection.toId}-${index + 1}`, ...connection })),
    ],
    script: null,
    ...(scene ?? {}),
  })
}

function conversationTopic(message: string, context: CanvasPlanningContext): string {
  return normalizeText([
    ...(context.recentMessages ?? []).map((item) => item.content),
    message,
  ].join(' '))
}

function isBackupReminderTopic(topic: string): boolean {
  return /(remind|reminder|nhac).{0,40}(backup|sao luu)|(?:backup|sao luu).{0,40}(remind|reminder|nhac)/.test(topic)
}

function replaceAgentScene(program: CanvasProgram, context: CanvasPlanningContext): CanvasProgram {
  if (!context.canvas || program.mode !== 'operations') return program
  const creatingPrototype = program.operations.some(
    (operation) => operation.op === 'create_node' && operation.id.startsWith('prototype-')
  )
  const ids = new Set<string>()
  for (const binding of context.canvas.bindings ?? []) {
    const prototypeBinding = binding.fromId.startsWith('prototype-') || binding.toId.startsWith('prototype-')
    if (prototypeBinding === creatingPrototype) ids.add(binding.id)
  }
  for (const shape of context.canvas.shapes) {
    const prototypeShape = Boolean(
      shape.semanticId?.startsWith('prototype-')
      || shape.visualRole?.startsWith('prototype-')
    )
    if (prototypeShape === creatingPrototype && (shape.nodeKind || prototypeShape)) {
      ids.add(shape.semanticId ?? shape.id)
    }
  }
  if (ids.size === 0) return program
  return canvasProgramSchema.parse({
    ...program,
    operations: [
      ...[...ids].slice(0, Math.max(0, 200 - program.operations.length)).map((id) => ({ op: 'delete' as const, id })),
      ...program.operations,
    ],
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
  const nodes = [
    { id: 'bat-dau', label: 'Mở tính năng', kind: 'screen' as const },
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

function backupReminderWorkflow(): CanvasProgram {
  const nodes = [
    { id: 'backup-dashboard', label: 'Mở tổng quan backup', kind: 'screen' as const, description: 'Xem trạng thái an toàn, nguồn dữ liệu và lịch gần nhất.', badge: 'ENTRY', lane: 'Người dùng', icon: 'cloud' as const, tone: 'brand' as const },
    { id: 'backup-source-ready', label: 'Nguồn backup đã sẵn sàng?', kind: 'decision' as const, description: 'Kiểm tra quyền truy cập và kết nối cloud trước khi lập lịch.', badge: 'GATE', lane: 'Hệ thống', icon: 'database' as const, tone: 'warning' as const },
    { id: 'backup-connect-source', label: 'Kết nối nguồn backup', kind: 'screen' as const, description: 'Chọn thiết bị hoặc Cloud Drive và cấp quyền truy cập.', badge: 'SETUP', lane: 'Người dùng', icon: 'database' as const, tone: 'info' as const },
    { id: 'backup-select-data', label: 'Chọn dữ liệu cần bảo vệ', kind: 'screen' as const, description: 'Chọn ảnh, video, tài liệu và điều kiện mạng phù hợp.', badge: 'SCOPE', lane: 'Người dùng', icon: 'shield' as const, tone: 'brand' as const },
    { id: 'backup-schedule', label: 'Đặt lịch backup', kind: 'screen' as const, description: 'Chọn tần suất, giờ chạy và điều kiện pin/Wi-Fi.', badge: 'PLAN', lane: 'Người dùng', icon: 'clock' as const, tone: 'accent' as const },
    { id: 'backup-notification', label: 'Cho phép nhắc backup?', kind: 'decision' as const, description: 'Quyết định kênh nhắc và khả năng theo sát lịch đã đặt.', badge: 'CONSENT', lane: 'Hệ thống', icon: 'bell' as const, tone: 'warning' as const },
    { id: 'backup-confirm-plan', label: 'Xác nhận kế hoạch', kind: 'screen' as const, description: 'Review nguồn, phạm vi, lịch và chính sách nhắc trước khi lưu.', badge: 'REVIEW', lane: 'Người dùng', icon: 'check' as const, tone: 'success' as const },
    { id: 'backup-due', label: 'Đến hạn backup', kind: 'process' as const, description: 'Scheduler đánh giá mạng, pin và dữ liệu mới.', badge: 'TRIGGER', lane: 'Tự động', icon: 'clock' as const, tone: 'neutral' as const },
    { id: 'backup-reminder', label: 'Hiển thị nhắc backup', kind: 'screen' as const, description: 'Hiển thị dung lượng, thời gian dự kiến và các hành động rõ ràng.', badge: 'MOMENT', lane: 'Người dùng', icon: 'bell' as const, tone: 'accent' as const },
    { id: 'backup-reminder-action', label: 'Người dùng chọn hành động', kind: 'decision' as const, description: 'Backup ngay, hoãn có chủ đích hoặc bỏ qua lần này.', badge: 'CHOICE', lane: 'Người dùng', icon: 'user' as const, tone: 'warning' as const },
    { id: 'backup-run', label: 'Bắt đầu backup', kind: 'process' as const, description: 'Khóa manifest phiên và tải dữ liệu theo batch có thể retry.', badge: 'RUN', lane: 'Tự động', icon: 'cloud' as const, tone: 'brand' as const },
    { id: 'backup-progress', label: 'Theo dõi tiến độ', kind: 'screen' as const, description: 'Hiển thị phần trăm, dữ liệu còn lại và khả năng chạy nền.', badge: 'LIVE', lane: 'Người dùng', icon: 'cloud' as const, tone: 'info' as const },
    { id: 'backup-success', label: 'Backup thành công', kind: 'screen' as const, description: 'Xác nhận dữ liệu an toàn và lịch tiếp theo.', badge: 'DONE', lane: 'Người dùng', icon: 'check' as const, tone: 'success' as const },
    { id: 'backup-failure', label: 'Backup thất bại', kind: 'note' as const, description: 'Giữ checkpoint, giải thích nguyên nhân và cho phép thử lại.', badge: 'RECOVERY', lane: 'Ngoại lệ', icon: 'warning' as const, tone: 'danger' as const },
    { id: 'backup-snooze', label: 'Hoãn nhắc', kind: 'process' as const, description: 'Lưu giờ nhắc mới và tránh gửi thông báo trùng.', badge: '+30 PHÚT', lane: 'Tự động', icon: 'clock' as const, tone: 'accent' as const },
    { id: 'backup-skip', label: 'Bỏ qua lần này', kind: 'note' as const, description: 'Ghi nhận lựa chọn nhưng giữ lịch backup tiếp theo.', badge: 'SKIP', lane: 'Ngoại lệ', icon: 'warning' as const, tone: 'neutral' as const },
    { id: 'backup-manual', label: 'Backup thủ công', kind: 'process' as const, description: 'Cho phép chủ động chạy mà không chờ lịch.', badge: 'SHORTCUT', lane: 'Người dùng', icon: 'sparkles' as const, tone: 'info' as const },
  ]
  const pairs: Array<[string, string, string?]> = [
    ['backup-dashboard', 'backup-source-ready'],
    ['backup-source-ready', 'backup-select-data', 'Đã kết nối'],
    ['backup-source-ready', 'backup-connect-source', 'Chưa kết nối'],
    ['backup-connect-source', 'backup-select-data', 'Kết nối xong'],
    ['backup-select-data', 'backup-schedule'],
    ['backup-schedule', 'backup-notification'],
    ['backup-notification', 'backup-confirm-plan', 'Tiếp tục'],
    ['backup-confirm-plan', 'backup-due', 'Lưu kế hoạch'],
    ['backup-dashboard', 'backup-manual', 'Backup ngay'],
    ['backup-manual', 'backup-run'],
    ['backup-due', 'backup-reminder'],
    ['backup-reminder', 'backup-reminder-action'],
    ['backup-reminder-action', 'backup-run', 'Backup ngay'],
    ['backup-reminder-action', 'backup-snooze', 'Nhắc lại sau'],
    ['backup-reminder-action', 'backup-skip', 'Bỏ qua'],
    ['backup-snooze', 'backup-due', 'Đến giờ mới'],
    ['backup-run', 'backup-progress'],
    ['backup-progress', 'backup-success', 'Thành công'],
    ['backup-progress', 'backup-failure', 'Thất bại'],
    ['backup-failure', 'backup-run', 'Thử lại'],
  ]
  return operationsProgram(
    'User flow nhắc backup gồm thiết lập, nhắc đúng hạn, backup thủ công và các nhánh ngoại lệ',
    nodes,
    pairs.map(([fromId, toId, label]) => ({ fromId, toId, ...(label ? { label } : {}) })),
    {
      sceneType: 'workflow',
      title: 'Backup Reminder · MVP Journey',
      description: 'Từ thiết lập niềm tin đến khoảnh khắc nhắc đúng lúc, có đường lui rõ ràng khi người dùng hoãn hoặc phiên backup lỗi.',
    },
  )
}

function backupPrototypeScreens(): CanvasNodeInput[] {
  return [
    {
      id: 'prototype-backup-dashboard',
      label: 'Tổng quan backup',
      kind: 'screen',
      description: 'Home ưu tiên cảm giác an toàn và hành động tiếp theo.',
      tone: 'brand',
      badge: '01 · OVERVIEW',
      screen: {
        eyebrow: 'BACKUP REMINDER',
        title: 'Dữ liệu của bạn đang an toàn',
        subtitle: 'Lần backup gần nhất hôm qua lúc 22:30.',
        blocks: [
          { id: 'health', kind: 'hero', label: 'Trạng thái', value: 'Đã bảo vệ', helper: '510 tệp · 12,4 GB', tone: 'success', span: 'full' },
          { id: 'next', kind: 'metric', label: 'Lịch tiếp theo', value: '22:30 hôm nay', helper: 'Còn 6 giờ 12 phút', tone: 'accent', span: 'half' },
          { id: 'storage', kind: 'metric', label: 'Cloud Drive', value: '64%', helper: 'Đã sử dụng', tone: 'info', span: 'half' },
          { id: 'new-files', kind: 'status', label: 'Có 24 tệp mới', value: '1,8 GB đang chờ', helper: 'Wi-Fi ổn định', tone: 'warning', span: 'full' },
        ],
        primaryAction: 'Backup ngay',
        secondaryAction: 'Xem lịch sử',
        navItems: ['Tổng quan', 'Lịch', 'Nhật ký'],
        activeNav: 'Tổng quan',
      },
    },
    {
      id: 'prototype-backup-source',
      label: 'Kết nối nguồn backup',
      kind: 'screen',
      description: 'Chọn nguồn và phạm vi dữ liệu bằng lựa chọn có trạng thái.',
      tone: 'info',
      badge: '02 · SOURCE',
      screen: {
        eyebrow: 'THIẾT LẬP 1/2',
        title: 'Bạn muốn bảo vệ dữ liệu nào?',
        subtitle: 'Có thể thay đổi lựa chọn này bất cứ lúc nào.',
        blocks: [
          { id: 'device', kind: 'choice', label: 'Thiết bị này', value: 'Đã chọn', helper: 'Ảnh, video và tài liệu', tone: 'brand', span: 'full' },
          { id: 'cloud', kind: 'choice', label: 'Cloud Drive', value: 'Đã kết nối', helper: 'minh@work.vn', tone: 'success', span: 'full' },
          { id: 'folders', kind: 'list', label: 'Thư mục', value: 'Camera · Screenshots · Documents', helper: '510 tệp', tone: 'neutral', span: 'full' },
          { id: 'wifi', kind: 'toggle', label: 'Chỉ backup khi có Wi-Fi', value: 'Bật', helper: null, tone: 'info', span: 'full' },
        ],
        primaryAction: 'Tiếp tục',
        secondaryAction: 'Để sau',
        navItems: ['Tổng quan', 'Lịch', 'Nhật ký'],
        activeNav: 'Tổng quan',
      },
    },
    {
      id: 'prototype-backup-schedule',
      label: 'Lịch & nhắc backup',
      kind: 'screen',
      description: 'Cấu hình lịch bằng dữ liệu thực thay cho input placeholder.',
      tone: 'accent',
      badge: '03 · SCHEDULE',
      screen: {
        eyebrow: 'THIẾT LẬP 2/2',
        title: 'Lịch backup phù hợp với bạn',
        subtitle: 'Ứng dụng chỉ chạy khi điều kiện an toàn.',
        blocks: [
          { id: 'frequency', kind: 'field', label: 'Tần suất', value: 'Mỗi ngày', helper: null, tone: 'brand', span: 'half' },
          { id: 'time', kind: 'field', label: 'Thời gian', value: '22:30', helper: null, tone: 'accent', span: 'half' },
          { id: 'reminder', kind: 'toggle', label: 'Nhắc trước 15 phút', value: 'Bật', helper: 'Có thể hoãn 30 phút', tone: 'success', span: 'full' },
          { id: 'conditions', kind: 'info', label: 'Điều kiện chạy', value: 'Wi-Fi · Pin trên 30%', helper: 'Ưu tiên khi đang sạc', tone: 'neutral', span: 'full' },
        ],
        primaryAction: 'Lưu kế hoạch',
        secondaryAction: 'Quay lại',
        navItems: ['Tổng quan', 'Lịch', 'Nhật ký'],
        activeNav: 'Lịch',
      },
    },
    {
      id: 'prototype-backup-reminder',
      label: 'Nhắc backup đến hạn',
      kind: 'screen',
      description: 'Khoảnh khắc quyết định: rõ dung lượng, thời gian và ba lựa chọn.',
      tone: 'warning',
      badge: '04 · REMINDER',
      screen: {
        eyebrow: 'ĐẾN LỊCH · 22:30',
        title: '24 tệp đang chờ được bảo vệ',
        subtitle: 'Khoảng 8 phút qua Wi-Fi hiện tại.',
        blocks: [
          { id: 'payload', kind: 'hero', label: 'Dữ liệu mới', value: '1,8 GB', helper: 'Ảnh & video · Documents', tone: 'brand', span: 'full' },
          { id: 'network', kind: 'status', label: 'Điều kiện sẵn sàng', value: 'Wi-Fi tốt · Pin 68%', helper: 'Có thể chạy nền', tone: 'success', span: 'full' },
          { id: 'snooze', kind: 'choice', label: 'Chưa tiện lúc này?', value: 'Nhắc lại sau 30 phút', helper: 'Lịch gốc vẫn được giữ', tone: 'accent', span: 'full' },
        ],
        primaryAction: 'Backup ngay',
        secondaryAction: 'Bỏ qua lần này',
        navItems: [],
        activeNav: null,
      },
    },
    {
      id: 'prototype-backup-result',
      label: 'Kết quả backup',
      kind: 'screen',
      description: 'Kết thúc bằng bằng chứng rõ ràng và bước tiếp theo.',
      tone: 'success',
      badge: '05 · COMPLETE',
      screen: {
        eyebrow: 'HOÀN TẤT',
        title: '24 tệp mới đã an toàn',
        subtitle: 'Phiên BK-0724 hoàn thành trong 7 phút 42 giây.',
        blocks: [
          { id: 'result', kind: 'hero', label: 'Đã backup', value: '1,8 GB', helper: 'Không có lỗi', tone: 'success', span: 'full' },
          { id: 'destination', kind: 'info', label: 'Đích lưu', value: 'Cloud Drive', helper: 'minh@work.vn', tone: 'info', span: 'half' },
          { id: 'next-run', kind: 'metric', label: 'Lần tiếp theo', value: '22:30 mai', helper: 'Tự động', tone: 'accent', span: 'half' },
          { id: 'timeline', kind: 'timeline', label: 'Nhật ký phiên', value: 'Chuẩn bị → Tải lên → Xác minh', helper: 'Đã read-back', tone: 'neutral', span: 'full' },
        ],
        primaryAction: 'Về tổng quan',
        secondaryAction: 'Xem nhật ký',
        navItems: ['Tổng quan', 'Lịch', 'Nhật ký'],
        activeNav: 'Nhật ký',
      },
    },
  ]
}

function prototypeScreens(message: string, context: CanvasPlanningContext): CanvasProgram {
  const topic = conversationTopic(message, context)
  if (isBackupReminderTopic(topic)) {
    const nodes = backupPrototypeScreens()
    return operationsProgram(
      `Prototype product concept ${nodes.length} màn hình có thể chỉnh sửa trực tiếp`,
      nodes,
      nodes.slice(1).map((node, index) => ({ fromId: nodes[index]!.id, toId: node.id, label: 'Tiếp tục' })),
      {
        sceneType: 'prototype',
        title: 'Backup Reminder · Product Concept',
        description: 'Quiet confidence: giúp người dùng hiểu dữ liệu nào đang an toàn, điều gì sẽ xảy ra tiếp theo và luôn có quyền kiểm soát.',
      },
    )
  }
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
    { sceneType: 'prototype', title: 'MVP Product Prototype', description: 'Các màn hình chính để review luồng và nội dung.' },
  )
}

export function planExplicitCanvasRequest(message: string, selection?: CanvasSelectionContext, context: CanvasPlanningContext = {}): CanvasProgram | undefined {
  const normalized = normalizeText(message)
  if (context.intent === 'draw') {
    const prototypeIntent = /(prototype|wireframe)/.test(normalized)
      || (!/(workflow|user flow|flow)/.test(normalized) && /(ve|phac thao|tao).{0,28}man hinh/.test(normalized))
    if (prototypeIntent) return replaceAgentScene(prototypeScreens(message, context), context)
    const steps = requestedWorkflowSteps(message)
    if (steps.length < 2) {
      const topic = conversationTopic(message, context)
      const program = /(dat xe|goi xe|booking xe|ride)/.test(topic)
        ? rideBookingWorkflow()
        : isBackupReminderTopic(topic)
          ? backupReminderWorkflow()
          : genericFullWorkflow(context)
      return replaceAgentScene(program, context)
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
    return replaceAgentScene(
      canvasProgramSchema.parse({ schemaVersion: 1, mode: 'operations', summary: `Workflow ${steps.join(' -> ')}`, operations, script: null }),
      context,
    )
  }

  if (context.intent !== 'edit') return undefined
  const selectedId = selection?.entityId
  if (selectedId && /(otp|retry|thu lai|loi|error|nhanh|branch)/.test(normalized)) {
    const additions = [
      ...(normalized.includes('otp') ? [{
        id: `${selectedId}-otp`,
        label: 'Nhập OTP',
        kind: 'screen' as const,
        description: 'Xác thực mã một lần và hiển thị thời gian còn lại.',
        badge: 'SECURE',
        lane: 'Người dùng',
        icon: 'shield' as const,
        tone: 'info' as const,
      }] : []),
      ...(/retry|thu lai/.test(normalized) ? [{
        id: `${selectedId}-retry`,
        label: 'Thử lại',
        kind: 'process' as const,
        description: 'Khôi phục từ checkpoint gần nhất mà không tạo phiên trùng.',
        badge: 'RETRY',
        lane: 'Tự động',
        icon: 'clock' as const,
        tone: 'success' as const,
      }] : []),
      ...(/loi|error/.test(normalized) ? [{
        id: `${selectedId}-error`,
        label: `${selection.label} thất bại`,
        kind: 'note' as const,
        description: 'Giải thích nguyên nhân và giữ một đường phục hồi rõ ràng.',
        badge: 'EXCEPTION',
        lane: 'Ngoại lệ',
        icon: 'warning' as const,
        tone: 'danger' as const,
      }] : []),
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
