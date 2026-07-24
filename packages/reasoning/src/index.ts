import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import {
  extractJson,
  parsePhaseReasoningResult,
  reasoningJsonSchemaForPhase,
  type CanvasSelectionContext,
  type CanvasDiffContext,
  type CanvasDocumentContext,
  type ChatMessage,
  type ProviderProbe,
  type PhaseReasoningResult,
  type ProviderCapabilities,
  type ProviderEvent,
  type ProviderIntent,
  type ProductSpec,
  type FigmaCreativeBlueprint,
  type WorkflowView,
  validateFigmaCreativeBlueprintStructure,
} from '@pm-agent/domain'

const execFileAsync = promisify(execFile)

export interface ReasoningRequest {
  threadId: string
  phase: WorkflowView
  message: string
  recentMessages: ChatMessage[]
  selection?: CanvasSelectionContext
  canvas?: CanvasDocumentContext
  canvasDiff?: CanvasDiffContext
  responseMode?: 'route' | 'creative' | 'figma'
  intentHint?: ProviderIntent
  productSpec?: ProductSpec
  figmaComponentRoles?: string[]
  remoteRef: string | null
}

export interface ProviderRuntimeConfig {
  modelId: string
  apiKey?: string
}

export interface ProviderResponse {
  result: PhaseReasoningResult
  remoteRef: string | null
  capabilities: ProviderCapabilities
  events: ProviderEvent[]
}

export interface ReasoningProvider {
  readonly id: string
  readonly capabilities: ProviderCapabilities
  probe(config: ProviderRuntimeConfig): Promise<ProviderProbe>
  reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse>
}

function normalizedResponse(
  result: PhaseReasoningResult,
  remoteRef: string | null,
  capabilities: ProviderCapabilities,
  usage?: { inputTokens: number; outputTokens: number },
): ProviderResponse {
  const at = new Date().toISOString()
  const events: ProviderEvent[] = [
    { type: 'turn_started', sequence: 0, at },
    { type: 'text_delta', sequence: 1, at, delta: result.message },
    { type: 'result', sequence: 2, at, result },
  ]
  if (usage) events.push({ type: 'usage', sequence: events.length, at, ...usage })
  events.push({ type: 'turn_completed', sequence: events.length, at })
  return { result, remoteRef, capabilities, events }
}

const mockCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: false, remoteResume: false, usage: false }
const codexCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: true, cancellation: true, remoteResume: true, usage: false }
const openAiCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: true, remoteResume: false, usage: true }
const geminiCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: false, remoteResume: false, usage: true }
const anthropicCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: true, remoteResume: false, usage: true }

const systemPolicy = `Bạn là reasoning provider cho PM Lifecycle Agent.
Mục tiêu: giúp PM biến ý tưởng thành ProductSpec có traceability và thay đổi scope có kiểm soát.
Chỉ trả về JSON đúng schema được cung cấp. Không dùng markdown.
Luôn phân loại yêu cầu bằng intent:
- conversation: trao đổi sản phẩm, trả lời hoặc phân tích mà không thực thi hành động;
- discovery: người dùng chủ động bắt đầu/tiếp tục guided discovery;
- draw: tạo mới workflow, prototype hoặc scene trực quan;
- edit: sửa canvas hiện có; target là tên/ID vùng cần sửa nếu người dùng nêu rõ;
- promote: chốt canvas thành ProductSpec preview;
- change: thêm/sửa/bỏ business scope trong ProductSpec;
- artifact: chuẩn bị, duyệt, xem trạng thái hoặc retry Figma/artifact; artifactAction phải tương ứng.
Không suy ra canvas mutation chỉ vì câu có các động từ chung. Khi không chắc, dùng conversation.
Mỗi legacy command luôn có đủ type, label, query, view, nodeId, nodeKind, fromId, toId; field không áp dụng phải là null.
Canvas là không gian sáng tạo, không phải một lifecycle form. Chỉ đề xuất thay đổi canvas khi người dùng yêu cầu vẽ/sửa rõ ràng hoặc đang feedback vùng chọn; hội thoại bình thường phải dùng mode none.
Khi schema có canvasProgram, luôn trả field này. Với flow/prototype, ưu tiên mode operations. Mode script chỉ dành cho developer automation lặp lại; mode none khi không cần đổi canvas.
Mỗi canvas operation luôn có đủ op, id, label, kind, fromId, toId, color, x, y, description, badge, lane, icon, tone, screen; field không áp dụng phải là null.
CanvasProgram luôn có sceneType, title, description; field không áp dụng phải là null.
Luôn trả phase đúng phase hiện tại và phaseData đúng schema phase được cung cấp.
Các lệnh canvas chỉ là đề xuất hiển thị; không tuyên bố đã ghi Figma, Jira hay Zdoc.
Trả lời tiếng Việt tự nhiên như một product/design collaborator: nói rõ giả định, lựa chọn và điều người dùng có thể feedback. Không ép mọi lượt hội thoại thành một bước lifecycle.
Khi người dùng yêu cầu bỏ một scope, dùng remove_card. Khi yêu cầu thêm, dùng add_card.
Khi yêu cầu xem một vùng lifecycle, dùng switch_view. Khi muốn tìm/nhấn mạnh entity, dùng focus_card.
Khi vẽ workflow, mỗi create_node cần title cụ thể, mô tả outcome/logic, lane, badge, icon và tone; nối đầy đủ happy path cùng ngoại lệ cần thiết bằng ID ổn định.
Khi vẽ prototype, mỗi screen node phải có screen spec riêng gồm content blocks, dữ liệu mẫu, trạng thái, CTA và navigation phù hợp sản phẩm. Không dùng placeholder kiểu "Thông tin chính" hoặc lặp cùng layout cho mọi màn.
Không thay yêu cầu bằng flow mẫu chung. Không cần sinh tọa độ trừ khi người dùng yêu cầu bố cục cụ thể; renderer sẽ layout an toàn. ProductSpec và Figma không nhận raw tọa độ canvas.`

const figmaDesignPolicy = `Bạn đang làm việc như một senior product designer cho Zalo Mini App.
Hãy tạo một Creative Figma Blueprint gần sản phẩm thật, không phải wireframe và không lặp một template cho mọi màn hình.
Mỗi màn hình phải có hierarchy, content, state và interaction riêng theo đúng ProductSpec. Dùng dữ liệu mẫu cụ thể, không dùng placeholder như "Thông tin chính", "Lựa chọn của người dùng" hay "Trạng thái hiện tại".
Giữ mỗi màn hình trong 7-14 element có chủ đích: một root frame, 2-4 vùng composition, text cần thiết và toàn bộ ZDS controls bắt buộc. Không vẽ từng chi tiết nhỏ thành một element riêng.
ZDS component chỉ dành cho interaction controls phù hợp như app header, button, input, switch, checkbox, list và status. Dùng primitives frame/text/rectangle/ellipse/divider tự do để tạo composition, visual hierarchy, data visualization và product-specific moments.
Element được khai báo theo thứ tự cha trước con. parentId null nghĩa là đặt trực tiếp trong screen. Với parent có auto-layout vertical/horizontal, x/y nên null. Với layout none, đặt x/y cụ thể.
Mỗi component element phải dùng đúng một componentRole trong danh sách được cung cấp. Không bịa component role.
Giữ copy trong ZDS control ngắn và đúng chức năng: app header tối đa 32 ký tự, button tối đa 28 ký tự, status/error message tối đa 64 ký tự. Đưa giải thích dài sang text primitive hoặc supporting card thay vì nhồi vào component.
Thiết kế cho frame mobile 390x844, giữ touch target tối thiểu 44px, text có tương phản, không để nội dung tràn frame.
Tạo prototype edge từ CTA component thật đến màn hình đích. fromElementId phải tồn tại trong fromScreenId.
Ưu tiên 4-7 màn hình quan trọng thay vì nhiều màn hình hời hợt. Giữ screenId và requirementIds đúng ProductSpec.
Chỉ trả JSON đúng schema.`

function outputSchemaFor(request: ReasoningRequest): Record<string, unknown> {
  const creative = request.responseMode === 'creative'
  const figma = request.responseMode === 'figma'
  return reasoningJsonSchemaForPhase(request.phase, {
    includeCanvasProgram: creative,
    includeFigmaBlueprint: figma,
    ...(creative && request.intentHint ? { intentKind: request.intentHint.kind } : {}),
  })
}

function buildPrompt(request: ReasoningRequest): string {
  const transcript = request.recentMessages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n')
  const selection = request.selection
    ? `Canvas đang chọn ${request.selection.selectedShapeCount ?? 1} shape: ${request.selection.label}. Ngữ cảnh vùng chọn: ${(request.selection.contextItems ?? [])
      .slice(0, 12)
      .map((item) => `${item.entityId ?? item.shapeId}:${item.label}`)
      .join(' | ') || request.selection.entityId}`
    : 'Canvas không có entity được chọn.'
  const canvas = request.canvas
    ? `Canvas revision ${request.canvas.revision}, ${request.canvas.shapes.length} shapes:\n${request.canvas.shapes.slice(0, 80).map((shape) => {
      const details = [shape.description, shape.lane ? `lane=${shape.lane}` : '', ...(shape.content ?? []).slice(0, 4)].filter(Boolean).join(' · ')
      return `- ${shape.semanticId ?? shape.id} [${shape.type}/${shape.visualRole ?? shape.nodeKind ?? 'free'}] ${shape.label || ''}${details ? ` — ${details}` : ''}`
    }).join('\n') || '- trống'}`
    : 'Canvas chưa có read-back context.'
  const diff = request.canvasDiff
    ? `Thay đổi người dùng vừa Sync (${request.canvasDiff.fromRevision} -> ${request.canvasDiff.toRevision}): ${request.canvasDiff.summary}\n${request.canvasDiff.changes.slice(0, 30).map((item) => `- ${item.change}: ${item.id} ${item.label}`).join('\n')}`
    : 'Không có CanvasDiff mới trong lượt này.'
  const responseInstruction = request.responseMode === 'figma'
    ? `${figmaDesignPolicy}

ProductSpec:
${JSON.stringify(request.productSpec)}

ZDS semantic roles được phép:
${(request.figmaComponentRoles ?? []).join(', ')}

Hãy trả figmaBlueprint. message chỉ tóm tắt design direction và những lựa chọn quan trọng. intent phải là artifact/prepare. commands để trống.`
    : request.responseMode === 'creative'
    ? `Agent Core đã khóa intent ${request.intentHint?.kind ?? 'draw'}. Hãy hiện thực hóa đúng yêu cầu bằng Canvas Program có thể chỉnh sửa; không đổi sang intent khác.`
    : 'Hãy phân loại intent trước. Đây là route nhẹ: không tạo Canvas Program trong lượt này.'
  return `${systemPolicy}\n\n${responseInstruction}\n\nPhase hiện tại: ${request.phase}\n${selection}\n${canvas}\n${diff}\n\nLịch sử gần đây:\n${transcript}\n\nYêu cầu mới:\n${request.message}`
}

function parseProviderText(text: string, phase: WorkflowView): PhaseReasoningResult {
  try {
    return parsePhaseReasoningResult(extractJson(text), phase)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid output'
    throw new Error(`Provider trả về dữ liệu không đúng schema: ${detail}`)
  }
}

function parseProviderFigmaBlueprint(text: string, phase: WorkflowView): PhaseReasoningResult {
  const result = parseProviderText(text, phase)
  if (!result.figmaBlueprint) throw new Error('Provider không trả Creative Figma Blueprint')
  validateFigmaCreativeBlueprintStructure(result.figmaBlueprint)
  return result
}

function parseProviderOutput(text: string, request: ReasoningRequest): PhaseReasoningResult {
  return request.responseMode === 'figma'
    ? parseProviderFigmaBlueprint(text, request.phase)
    : parseProviderText(text, request.phase)
}

function compactControlCopy(value: string, limit: number): string {
  const copy = value.trim().replace(/\s+/g, ' ')
  if (copy.length <= limit) return copy
  const candidate = copy.slice(0, limit + 1)
  const wordBoundary = candidate.lastIndexOf(' ')
  return candidate.slice(0, wordBoundary >= Math.floor(limit * 0.6) ? wordBoundary : limit).trim()
}

function mockCreativeBlueprint(spec: ProductSpec, roles: string[]): FigmaCreativeBlueprint {
  const available = new Set(roles)
  const activeRequirements = new Set(spec.requirements.filter((item) => item.status !== 'removed').map((item) => item.id))
  const screens = spec.screens
    .filter((screen) => screen.requirementIds.some((id) => activeRequirements.has(id)))
  const primaryRole = available.has('primary-button') ? 'primary-button' : roles[0] ?? 'primary-button'
  const headerRole = available.has('app-header') ? 'app-header' : null
  const outputScreens = screens.map((screen, index) => {
    const root = `root-${screen.id}`
    const hero = `hero-${screen.id}`
    const action = `action-${screen.id}`
    const elements: FigmaCreativeBlueprint['screens'][number]['elements'] = [
      {
        id: root, kind: 'frame', parentId: null, name: `${screen.title} content`, x: 0, y: 0, width: 390, height: 844,
        layout: 'vertical', gap: 16, paddingTop: 24, paddingRight: 20, paddingBottom: 24, paddingLeft: 20,
        fill: index === 0 ? '#F2F7FF' : '#FFFFFF', stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: null, fontSize: null, fontWeight: null, textAlign: null, componentRole: null, componentText: null, layoutGrow: 0,
      },
    ]
    if (headerRole) {
      elements.push({
        id: `header-${screen.id}`, kind: 'component', parentId: root, name: 'ZDS app header', x: null, y: null, width: 350, height: 52,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: null, stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: null, fontSize: null, fontWeight: null, textAlign: null, componentRole: headerRole,
        componentText: compactControlCopy(screen.title, 32), layoutGrow: 0,
      })
    }
    elements.push(
      {
        id: hero, kind: 'frame', parentId: root, name: 'Product moment', x: null, y: null, width: 350, height: 220,
        layout: 'vertical', gap: 10, paddingTop: 24, paddingRight: 20, paddingBottom: 24, paddingLeft: 20,
        fill: index === screens.length - 1 ? '#E8F8EF' : '#EAF3FF', stroke: null, strokeWidth: 0, radius: 20, opacity: 1,
        text: null, fontSize: null, fontWeight: null, textAlign: null, componentRole: null, componentText: null, layoutGrow: 0,
      },
      {
        id: `eyebrow-${screen.id}`, kind: 'text', parentId: hero, name: 'Journey label', x: null, y: null, width: 310, height: 20,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: '#0068FF', stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: `BƯỚC ${index + 1} · ${screen.title.toUpperCase()}`, fontSize: 12, fontWeight: 'semibold', textAlign: 'left', componentRole: null, componentText: null, layoutGrow: 0,
      },
      {
        id: `title-${screen.id}`, kind: 'text', parentId: hero, name: 'Screen headline', x: null, y: null, width: 310, height: 66,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: '#101828', stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: screen.title, fontSize: 30, fontWeight: 'bold', textAlign: 'left', componentRole: null, componentText: null, layoutGrow: 0,
      },
      {
        id: `purpose-${screen.id}`, kind: 'text', parentId: hero, name: 'Outcome copy', x: null, y: null, width: 310, height: 56,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: '#475467', stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: screen.purpose, fontSize: 15, fontWeight: 'regular', textAlign: 'left', componentRole: null, componentText: null, layoutGrow: 0,
      },
      {
        id: `detail-${screen.id}`, kind: 'frame', parentId: root, name: 'Product detail', x: null, y: null, width: 350, height: 230,
        layout: 'vertical', gap: 12, paddingTop: 18, paddingRight: 18, paddingBottom: 18, paddingLeft: 18,
        fill: '#FFFFFF', stroke: '#E4E7EC', strokeWidth: 1, radius: 16, opacity: 1,
        text: null, fontSize: null, fontWeight: null, textAlign: null, componentRole: null, componentText: null, layoutGrow: 0,
      },
      {
        id: `detail-title-${screen.id}`, kind: 'text', parentId: `detail-${screen.id}`, name: 'Detail title', x: null, y: null, width: 314, height: 28,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: '#101828', stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: index === 0 ? 'Mọi thứ cần biết trong một nhịp nhìn' : `Điều người dùng cần hoàn tất tại ${screen.title}`,
        fontSize: 18, fontWeight: 'semibold', textAlign: 'left', componentRole: null, componentText: null, layoutGrow: 0,
      },
      {
        id: `detail-body-${screen.id}`, kind: 'text', parentId: `detail-${screen.id}`, name: 'Concrete product content', x: null, y: null, width: 314, height: 96,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: '#344054', stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: `${screen.purpose}\n\nTrạng thái được lưu ngay trên thiết bị và có thể tiếp tục ở lần mở sau.`,
        fontSize: 14, fontWeight: 'regular', textAlign: 'left', componentRole: null, componentText: null, layoutGrow: 0,
      },
    )
    const screenRoles = [...new Set(screen.designSystemRoles.filter((role) => available.has(role) && role !== 'app-header'))]
    let actionRoleIndex = -1
    screenRoles.forEach((role, roleIndex) => {
      if (role.includes('button')) actionRoleIndex = roleIndex
    })
    for (const [roleIndex, role] of screenRoles.entries()) {
      elements.push({
        id: roleIndex === actionRoleIndex ? action : `${role}-${screen.id}`,
        kind: 'component',
        parentId: root,
        name: `ZDS ${role}`,
        x: null,
        y: null,
        width: 350,
        height: role.includes('button') ? 52 : 64,
        layout: 'none',
        gap: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        fill: null,
        stroke: null,
        strokeWidth: 0,
        radius: 0,
        opacity: 1,
        text: null,
        fontSize: null,
        fontWeight: null,
        textAlign: null,
        componentRole: role,
        componentText: role.includes('button')
          ? index === screens.length - 1 ? 'Hoàn tất' : 'Tiếp tục'
          : role.includes('message')
            ? compactControlCopy(screen.title, 64)
            : screen.title,
        layoutGrow: 0,
      })
    }
    if (actionRoleIndex < 0) {
      elements.push({
        id: action, kind: 'component', parentId: root, name: 'Primary journey action', x: null, y: null, width: 350, height: 52,
        layout: 'none', gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        fill: null, stroke: null, strokeWidth: 0, radius: 0, opacity: 1,
        text: null, fontSize: null, fontWeight: null, textAlign: null, componentRole: primaryRole,
        componentText: index === screens.length - 1 ? 'Hoàn tất' : 'Tiếp tục', layoutGrow: 0,
      })
    }
    return {
      screenId: screen.id,
      name: screen.title,
      purpose: screen.purpose,
      requirementIds: screen.requirementIds.filter((id) => activeRequirements.has(id)),
      width: 390,
      height: 844,
      background: index === 0 ? '#F2F7FF' : '#FFFFFF',
      presentationNote: `Màn ${index + 1} ưu tiên outcome ${screen.purpose}`,
      elements,
    }
  })
  return validateFigmaCreativeBlueprintStructure({
    schemaVersion: 1,
    conceptName: `Product story · ${spec.title}`,
    productPromise: spec.idea.summary,
    visualNarrative: 'Một hành trình Mini App rõ nhịp, dùng ZDS cho interaction và composition riêng cho từng product moment.',
    principles: ['Một nhiệm vụ chính trên mỗi màn hình', 'Nội dung thật trước trang trí', 'ZDS cho controls, primitives cho product expression'],
    screens: outputScreens,
    prototypeEdges: outputScreens.slice(0, -1).map((screen, index) => ({
      key: `edge:${screen.screenId}:${outputScreens[index + 1]!.screenId}`,
      fromElementId: `action-${screen.screenId}`,
      fromScreenId: screen.screenId,
      toScreenId: outputScreens[index + 1]!.screenId,
      trigger: 'on_tap',
      action: 'navigate',
    })),
  })
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function phaseData(phase: WorkflowView, normalized: string): PhaseReasoningResult['phaseData'] {
  if (phase === 'discover') {
    return {
      questions: [
        { id: 'Q-TARGET', prompt: 'Ai là người dùng chính?', options: ['Nhân viên văn phòng', 'Đối tác tại điểm bán', 'Quản trị vận hành'] },
        { id: 'Q-SUCCESS', prompt: 'Outcome ưu tiên của MVP?', options: ['Giảm thời gian chờ', 'Tăng tỷ lệ đặt trước', 'Giảm thao tác vận hành'] },
        { id: 'Q-CONSTRAINT', prompt: 'Constraint nào cần khóa trước?', options: ['Mini App only', 'OA + Mini App', 'Có tích hợp thanh toán'] },
      ],
      assumptions: ['Dữ liệu demo là synthetic', 'Jira và Zdoc dùng mock connector'],
    }
  }
  if (phase === 'decide') {
    return {
      options: [
        { id: 'OPT-LEAN', title: 'Lean ordering', tradeoff: 'Ra MVP nhanh, ít tích hợp phụ thuộc.' },
        { id: 'OPT-FULL', title: 'Full lifecycle', tradeoff: 'Traceability đầy đủ, effort triển khai cao hơn.' },
      ],
      recommendedOptionId: 'OPT-LEAN',
    }
  }
  if (phase === 'deliver') {
    return { artifactTargets: ['figma', 'jira', 'zdoc'], readinessSummary: 'ProductSpec sẵn sàng lập artifact plan có approval.' }
  }
  const removePayment = /(bo|xoa|remove|loai).*(payment|thanh toan|vi noi bo)/.test(normalized)
  return removePayment
    ? { operation: 'remove', targetEntityId: 'REQ-PAYMENT', ambiguity: null }
    : { operation: 'needs_user_input', targetEntityId: null, ambiguity: 'Chưa xác định được entity và operation cần thay đổi.' }
}

export function inferLocalCommands(message: string, phase: WorkflowView = 'discover'): PhaseReasoningResult {
  const normalized = normalizeText(message)
  const commands: PhaseReasoningResult['commands'] = []
  const visualRequest = /(workflow|user flow|prototype|so do|luong xu ly)/.test(normalized) && /(ve|tao|phac|draw)/.test(normalized)

  const viewMatchers: Array<[WorkflowView, string[]]> = [
    ['discover', ['discover', 'discovery', 'kham pha']],
    ['decide', ['decide', 'quyet dinh', 'phuong an']],
    ['deliver', ['deliver', 'delivery', 'ban giao']],
    ['change', ['change', 'impact', 'thay doi']],
  ]
  const matchedView = viewMatchers.find(([, words]) => words.some((word) => normalized.includes(word)))
  if (matchedView && /(mo|xem|chuyen|qua|view|tab)/.test(normalized)) {
    commands.push({ type: 'switch_view', view: matchedView[0] })
  }

  if (visualRequest) {
    // The offline planner in Agent Core owns the same rich scene contract used by live providers.
  } else if (/(bo|xoa|remove|loai)/.test(normalized)) {
    const query = /(payment|thanh toan|vi noi bo)/.test(normalized) ? 'payment' : message.replace(/^(hãy\s+)?(bỏ|xóa|remove|loại)\s*/i, '').trim()
    if (query) commands.push({ type: 'remove_card', query })
  } else if (/(them|add|tao card)/.test(normalized)) {
    const label = message.replace(/^(hãy\s+)?(thêm|add|tạo card)\s*/i, '').trim()
    if (label) commands.push({ type: 'add_card', label, view: matchedView?.[0] ?? 'discover' })
  } else if (/(focus|tim|chon|nhan manh)/.test(normalized)) {
    const query = /(payment|thanh toan|vi noi bo)/.test(normalized) ? 'payment' : message
    commands.push({ type: 'focus_card', query })
  }

  const phaseMessage: Record<WorkflowView, string> = {
    discover: 'Mình đã ghi nhận. Hãy khóa target user, outcome và constraint để tiếp tục.',
    decide: 'Mình đã tổng hợp hai phương án MVP. Hãy chọn một hướng để chuyển sang Delivery.',
    deliver: 'ProductSpec đã sẵn sàng lập artifact plan có approval và read-back verification.',
    change: 'Mình cần target entity và operation cụ thể trước khi tạo impact preview.',
  }
  const messageText = visualRequest
    ? /prototype/.test(normalized)
      ? 'Mình sẽ hiện thực hóa các màn hình như một product concept có nội dung, trạng thái và hành động riêng để bạn review trực tiếp.'
      : 'Mình sẽ dựng journey theo outcome của từng bước, làm rõ điểm quyết định và các nhánh phục hồi để bạn có đủ chất liệu feedback.'
    : commands.length > 0
    ? 'Mình đã tạo đề xuất trên canvas. Thay đổi business scope vẫn cần được review trước khi đồng bộ artifact.'
    : /(backup|sao luu)/.test(normalized)
      ? 'Ý tưởng này có một product moment khá rõ: giúp người dùng cảm thấy dữ liệu đang an toàn mà vẫn giữ quyền kiểm soát thời điểm backup. Canvas sẽ để trống cho đến khi bạn muốn trực quan hóa; trước mắt mình có thể cùng bạn làm rõ trigger, hành động hoãn và cách phục hồi khi backup lỗi.'
      : phaseMessage[phase]
  return {
    schemaVersion: 1,
    phase,
    message: messageText,
    commands,
    intent: inferMockIntent(message),
    phaseData: phaseData(phase, normalized),
  } as PhaseReasoningResult
}

function inferMockIntent(request: string | ReasoningRequest): ProviderIntent {
  const message = typeof request === 'string' ? request : request.message
  if (typeof request !== 'string' && request.intentHint) return request.intentHint
  if (typeof request !== 'string' && request.canvasDiff) {
    return { kind: 'conversation', target: null, artifactAction: null }
  }
  const text = message.toLocaleLowerCase('vi').trim()
  if (typeof request !== 'string' && request.selection) {
    return { kind: 'edit', target: request.selection.entityId, artifactAction: null }
  }
  if (/(^|\s)(kick[\s-]*off|bắt đầu discovery|khởi động discovery)(\s|$)/i.test(text)) {
    return { kind: 'discovery', target: null, artifactAction: null }
  }
  if (/(chốt|xác nhận|promote).*(flow|canvas|mvp|productspec)/i.test(text)) {
    return { kind: 'promote', target: null, artifactAction: null }
  }
  if (/(vẽ|draw|phác thảo|tạo).*(workflow|user flow|flow|sơ đồ|prototype|wireframe|journey)/i.test(text)) {
    return { kind: 'draw', target: null, artifactAction: null }
  }
  if (/(sửa|chỉnh).*(canvas|node|workflow|prototype)/i.test(text)) {
    return { kind: 'edit', target: null, artifactAction: null }
  }
  if (/^bỏ cái (đó|này)[.!?]?$/iu.test(text)) {
    return { kind: 'change', target: null, artifactAction: null }
  }
  if (/figma|kickoff package|artifact/i.test(text)) {
    const artifactAction = /trạng thái|status/i.test(text)
      ? 'status'
      : /retry|thử lại/i.test(text)
        ? 'retry'
        : /duyệt|đồng ý|xác nhận|hãy làm|làm đi/i.test(text)
          ? 'approve'
          : 'prepare'
    return { kind: 'artifact', target: null, artifactAction }
  }
  if (/(bỏ|xóa|remove|loại).*(scope|requirement|payment|thanh toán)/i.test(text)) {
    return { kind: 'change', target: null, artifactAction: null }
  }
  return { kind: 'conversation', target: null, artifactAction: null }
}

class MockProvider implements ReasoningProvider {
  readonly id = 'mock'
  readonly capabilities = mockCapabilities

  async probe(): Promise<ProviderProbe> {
    return { available: true, label: 'Sẵn sàng', detail: 'Deterministic offline provider', capabilities: this.capabilities }
  }

  async reason(request: ReasoningRequest): Promise<ProviderResponse> {
    const result = inferLocalCommands(request.message, request.phase)
    result.intent = inferMockIntent(request)
    if (request.responseMode === 'figma') {
      if (!request.productSpec) throw new Error('Mock Figma design requires ProductSpec')
      result.intent = { kind: 'artifact', target: null, artifactAction: 'prepare' }
      result.figmaBlueprint = mockCreativeBlueprint(request.productSpec, request.figmaComponentRoles ?? [])
      result.message = `Đã tạo creative blueprint cho ${result.figmaBlueprint.screens.length} màn hình.`
    }
    if (request.canvasDiff) {
      result.message = `Mình đã đọc phần bạn vừa thay đổi: ${request.canvasDiff.summary}. Vùng chọn và scene hiện tại sẽ là context ưu tiên cho lượt chỉnh tiếp theo.`
    }
    return normalizedResponse(result, null, this.capabilities)
  }
}

class OpenAIProvider implements ReasoningProvider {
  readonly id = 'openai'
  readonly capabilities = openAiCapabilities

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'OPENAI_API_KEY', 'OpenAI API key', this.capabilities)
  }

  async reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse> {
    const apiKey = requiredCredential(config.apiKey, 'OPENAI_API_KEY')
    const client = new OpenAI({ apiKey })
    const response = await client.responses.create({
      model: config.modelId,
      input: buildPrompt(request),
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'pm_lifecycle_reasoning',
          strict: true,
          schema: outputSchemaFor(request),
        },
      },
    }, { signal })
    return normalizedResponse(parseProviderOutput(response.output_text, request), response.id, this.capabilities, response.usage
      ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      : undefined)
  }
}

class GeminiProvider implements ReasoningProvider {
  readonly id = 'gemini'
  readonly capabilities = geminiCapabilities

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'GEMINI_API_KEY', 'Gemini API key', this.capabilities)
  }

  async reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse> {
    if (signal.aborted) throw new Error('Đã hủy yêu cầu')
    const apiKey = requiredCredential(config.apiKey, 'GEMINI_API_KEY')
    const client = new GoogleGenAI({ apiKey })
    const response = await client.models.generateContent({
      model: config.modelId,
      contents: buildPrompt(request),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: outputSchemaFor(request),
      },
    })
    const usage = response.usageMetadata
    return normalizedResponse(parseProviderOutput(response.text ?? '', request), null, this.capabilities, usage
      ? { inputTokens: usage.promptTokenCount ?? 0, outputTokens: usage.candidatesTokenCount ?? 0 }
      : undefined)
  }
}

class AnthropicProvider implements ReasoningProvider {
  readonly id = 'anthropic'
  readonly capabilities = anthropicCapabilities

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'ANTHROPIC_API_KEY', 'Anthropic API key', this.capabilities)
  }

  async reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse> {
    const apiKey = requiredCredential(config.apiKey, 'ANTHROPIC_API_KEY')
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: config.modelId,
      max_tokens: request.responseMode === 'figma' ? 16_000 : 1_400,
      system: systemPolicy,
      messages: [{ role: 'user', content: buildPrompt(request) }],
      output_config: {
        format: { type: 'json_schema', schema: outputSchemaFor(request) },
      },
    }, { signal })
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return normalizedResponse(parseProviderOutput(text, request), response.id, this.capabilities, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })
  }
}

type JsonObject = Record<string, unknown>

class CodexRpcClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  private readonly listeners = new Set<(message: JsonObject) => void>()
  private buffer = ''
  private nextId = 1

  constructor() {
    this.child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.consume(chunk))
    this.child.on('error', (error) => this.rejectAll(error))
    this.child.on('exit', (code) => {
      if (code && code !== 0) this.rejectAll(new Error(`Codex App Server exited with code ${code}`))
    })
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'pm-lifecycle-agent', title: 'PM Lifecycle Agent', version: '0.1.0' },
      capabilities: null,
    })
    this.notify('initialized', {})
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(`${JSON.stringify({ method, id, params })}\n`)
    })
  }

  notify(method: string, params: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`)
  }

  onNotification(listener: (message: JsonObject) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stop(): void {
    this.child.kill()
  }

  private consume(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let message: JsonObject
      try {
        message = JSON.parse(line) as JsonObject
      } catch {
        continue
      }
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (!pending) continue
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      } else {
        this.listeners.forEach((listener) => listener(message))
      }
    }
  }

  private rejectAll(error: Error): void {
    this.pending.forEach((pending) => pending.reject(error))
    this.pending.clear()
  }
}

class CodexProvider implements ReasoningProvider {
  readonly id = 'codex'
  readonly capabilities = codexCapabilities

  async probe(): Promise<ProviderProbe> {
    try {
      const { stdout } = await execFileAsync('codex', ['--version'], { timeout: 5_000 })
      return { available: true, label: 'Sẵn sàng', detail: stdout.trim(), capabilities: this.capabilities }
    } catch {
      return { available: false, label: 'Không khả dụng', detail: 'Không tìm thấy Codex CLI hoặc phiên đăng nhập.', capabilities: this.capabilities }
    }
  }

  async reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse> {
    const client = new CodexRpcClient()
    const abort = (): void => client.stop()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await client.initialize()
      let threadId = request.remoteRef
      if (threadId) {
        try {
          await client.request('thread/resume', {
            threadId,
            model: config.modelId,
            cwd: process.cwd(),
            approvalPolicy: 'never',
            sandbox: 'read-only',
            baseInstructions: systemPolicy,
          })
        } catch {
          threadId = null
        }
      }
      if (!threadId) {
        const started = await client.request('thread/start', {
          model: config.modelId,
          cwd: process.cwd(),
          approvalPolicy: 'never',
          sandbox: 'read-only',
          ephemeral: false,
          baseInstructions: `${systemPolicy}\nKhông đọc file, không chạy command và không gọi tool.`,
        }) as { thread: { id: string } }
        threadId = started.thread.id
      }

      let output = ''
      const completed = new Promise<void>((resolve, reject) => {
        const timeoutMs = request.responseMode === 'figma' ? 10 * 60_000 : 120_000
        const timeout = setTimeout(() => reject(new Error(`Codex timeout sau ${Math.round(timeoutMs / 60_000)} phút`)), timeoutMs)
        const unsubscribe = client.onNotification((notification) => {
          const method = notification.method
          const params = notification.params as JsonObject | undefined
          if (params?.threadId !== threadId) return
          if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') output += params.delta
          if (method === 'turn/completed') {
            clearTimeout(timeout)
            unsubscribe()
            const turn = params.turn as JsonObject | undefined
            if (turn?.status === 'failed') reject(new Error(`Codex turn failed: ${JSON.stringify(turn.error)}`))
            else resolve()
          }
        })
      })
      await client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: buildPrompt(request), text_elements: [] }],
        outputSchema: outputSchemaFor(request),
      })
      await completed
      return normalizedResponse(parseProviderOutput(output, request), threadId, this.capabilities)
    } finally {
      signal.removeEventListener('abort', abort)
      client.stop()
    }
  }
}

function credentialProbe(apiKey: string | undefined, envName: string, label: string, capabilities: ProviderCapabilities): ProviderProbe {
  const present = Boolean(apiKey || process.env[envName])
  return present
    ? { available: true, label: 'Đã cấu hình', detail: `${label} có sẵn trong Keychain hoặc environment.`, capabilities }
    : { available: false, label: 'Thiếu API key', detail: `Nhập ${label} trong Settings hoặc đặt ${envName}.`, capabilities }
}

function requiredCredential(apiKey: string | undefined, envName: string): string {
  const value = apiKey || process.env[envName]
  if (!value) throw new Error(`Thiếu credential: ${envName}`)
  return value
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ReasoningProvider>()

  constructor() {
    const adapters: ReasoningProvider[] = [
      new MockProvider(),
      new CodexProvider(),
      new OpenAIProvider(),
      new GeminiProvider(),
      new AnthropicProvider(),
    ]
    adapters.forEach((adapter) => this.providers.set(adapter.id, adapter))
  }

  get(providerId: string): ReasoningProvider {
    const adapter = this.providers.get(providerId)
    if (!adapter) throw new Error(`Provider chưa được hỗ trợ: ${providerId}`)
    return adapter
  }
}
