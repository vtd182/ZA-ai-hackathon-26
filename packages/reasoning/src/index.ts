import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import {
  conversationRouteJsonSchema,
  extractJson,
  parseConversationRouteResult,
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
  type ConversationSuggestion,
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
  suggestions: ConversationSuggestion[]
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
  suggestions: ConversationSuggestion[] = [],
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
  return { result, suggestions, remoteRef, capabilities, events }
}

function normalizedParsedResponse(
  parsed: ParsedProviderOutput,
  remoteRef: string | null,
  capabilities: ProviderCapabilities,
  usage?: { inputTokens: number; outputTokens: number },
): ProviderResponse {
  return normalizedResponse(parsed.result, remoteRef, capabilities, parsed.suggestions, usage)
}

const mockCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: false, remoteResume: false, usage: false }
const codexCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: true, cancellation: true, remoteResume: true, usage: false }
const openAiCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: true, remoteResume: false, usage: true }
const geminiCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: false, remoteResume: false, usage: true }
const anthropicCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: true, remoteResume: false, usage: true }
const agentRouterCapabilities: ProviderCapabilities = { structuredOutput: true, streaming: false, cancellation: true, remoteResume: false, usage: true }

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
Canvas selection chỉ là context chú ý, không phải quyền sửa. Khi người dùng hỏi, critique hoặc explore về vùng chọn, vẫn dùng conversation; chỉ dùng edit khi họ yêu cầu thay đổi rõ ràng.
Khi schema có canvasProgram, luôn trả field này. Với flow/prototype, ưu tiên mode operations. Mode script chỉ dành cho developer automation lặp lại; mode none khi không cần đổi canvas.
Mỗi canvas operation luôn có đủ op, id, label, kind, fromId, toId, color, x, y, description, badge, lane, icon, tone, screen; field không áp dụng phải là null.
CanvasProgram luôn có sceneType, title, description; field không áp dụng phải là null.
Luôn trả phase đúng phase hiện tại và phaseData đúng schema phase được cung cấp.
Các lệnh canvas chỉ là đề xuất hiển thị; không tuyên bố đã ghi Figma, Jira hay Zdoc.
Trả lời tiếng Việt tự nhiên như một product/design collaborator: nói rõ giả định, lựa chọn và điều người dùng có thể feedback. Không ép mọi lượt hội thoại thành một bước lifecycle.
Khi người dùng yêu cầu bỏ một scope, dùng remove_card. Khi yêu cầu thêm, dùng add_card.
Khi yêu cầu xem một vùng lifecycle, dùng switch_view. Khi muốn tìm/nhấn mạnh entity, dùng focus_card.
Khi vẽ workflow, mỗi create_node cần title theo outcome (không phải tên màn), mô tả logic, lane theo actor (User/Mini App/Backend), badge, icon và tone; nối bằng ID ổn định.
Flow phải ĐẦY ĐỦ, không để reviewer bắt lỗi được: mỗi node decision có ≥2 nhánh và MỖI nhánh có nhãn điều kiện (Có/Không, Hợp lệ/Sai); không có ngõ cụt (mọi node không phải điểm kết thúc đều có cạnh ra); mỗi bước rủi ro (OTP, API, thanh toán, ghép tài khoản) có nhánh lỗi + phục hồi; vòng lặp retry phải có giới hạn số lần + nhánh thoát (không kẹt); có node terminal rõ (Hoàn tất/Vào Home/Thành công) và exit tổng thể (Hủy/Thoát). Ưu tiên nhãn cạnh ngắn cho mọi nhánh rẽ.
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
  if (request.responseMode === 'route') return conversationRouteJsonSchema
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
    : request.responseMode === 'route'
    ? `Đây là một lượt cộng tác, không phải lifecycle form.
Trả lời trực tiếp như một senior product/design collaborator: phản biện giả định, làm rõ điều quan trọng và giúp người dùng thấy họ có thể feedback vào đâu.
Trong message, cho người dùng thấy một giả thuyết hoặc lựa chọn thiết kế cụ thể, điều còn chưa chắc và điểm feedback hữu ích nhất. Không kể chain-of-thought và không dùng câu trả lời quy trình chung chung.
Chỉ dùng intent khác conversation khi câu hiện tại yêu cầu hành động rõ ràng. Không tự bắt đầu Discovery, không tự vẽ và không tự chuẩn bị artifact chỉ vì người dùng đang kể một ý tưởng.
Đưa 0-3 suggestions ngắn, cụ thể theo nội dung vừa trao đổi, khác nhau và hoàn toàn tùy chọn. Suggestions có thể là khám phá thêm, phác trực quan, refine ý tưởng, chốt ProductSpec hoặc chuẩn bị artifact. Không dùng nhãn chung chung kiểu "Tiếp tục" và không biến suggestions thành checklist bắt buộc.`
    : 'Đây là lượt lifecycle có cấu trúc. Hoàn thành đúng phaseData của phase hiện tại.'
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

interface ParsedProviderOutput {
  result: PhaseReasoningResult
  suggestions: ConversationSuggestion[]
}

function conversationPhaseEnvelope(
  route: ReturnType<typeof parseConversationRouteResult>,
  phase: WorkflowView,
): PhaseReasoningResult {
  return parsePhaseReasoningResult({
    schemaVersion: 1,
    phase,
    message: route.message,
    commands: [],
    intent: route.intent,
    phaseData: phaseData(phase, ''),
  }, phase)
}

function parseProviderOutput(text: string, request: ReasoningRequest): ParsedProviderOutput {
  if (request.responseMode === 'route') {
    try {
      const route = parseConversationRouteResult(extractJson(text))
      return { result: conversationPhaseEnvelope(route, request.phase), suggestions: route.suggestions }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'invalid output'
      throw new Error(`Provider trả về dữ liệu không đúng schema: ${detail}`)
    }
  }
  return {
    result: request.responseMode === 'figma'
      ? parseProviderFigmaBlueprint(text, request.phase)
      : parseProviderText(text, request.phase),
    suggestions: [],
  }
}

function compactControlCopy(value: string, limit: number): string {
  const copy = value.trim().replace(/\s+/g, ' ')
  if (copy.length <= limit) return copy
  const candidate = copy.slice(0, limit + 1)
  const wordBoundary = candidate.lastIndexOf(' ')
  return candidate.slice(0, wordBoundary >= Math.floor(limit * 0.6) ? wordBoundary : limit).trim()
}

export function createScaffoldFigmaBlueprint(
  spec: ProductSpec,
  roles: string[],
  options: { sparse?: boolean } = {},
): FigmaCreativeBlueprint {
  const available = new Set(roles)
  const activeRequirements = new Set(spec.requirements.filter((item) => item.status !== 'removed').map((item) => item.id))
  const screens = spec.screens
    .filter((screen) => screen.requirementIds.some((id) => activeRequirements.has(id)))
  const primaryRole = available.has('primary-button') ? 'primary-button' : roles[0] ?? 'primary-button'
  const headerRole = available.has('app-header') ? 'app-header' : null
  const outputScreens = screens.map((screen, index) => {
    const root = `root-${screen.id}`
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
    if (!options.sparse) {
      const hero = `hero-${screen.id}`
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
    }
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
      presentationNote: options.sparse
        ? `Sparse guarded scaffold only; create a product-specific composition for ${screen.purpose}`
        : `Màn ${index + 1} ưu tiên outcome ${screen.purpose}`,
      elements,
    }
  })
  return validateFigmaCreativeBlueprintStructure({
    schemaVersion: 1,
    conceptName: `Product story · ${spec.title}`,
    productPromise: spec.idea.summary,
    visualNarrative: options.sparse
      ? 'Scaffold tối thiểu chỉ giữ traceability và ZDS controls; design worker sở hữu toàn bộ art direction và composition.'
      : 'Một hành trình Mini App rõ nhịp, dùng ZDS cho interaction và composition riêng cho từng product moment.',
    principles: options.sparse
      ? ['Không coi scaffold là design direction', 'ProductSpec quyết định nội dung', 'ZDS giữ interaction, design worker sở hữu expression']
      : ['Một nhiệm vụ chính trên mỗi màn hình', 'Nội dung thật trước trang trí', 'ZDS cho controls, primitives cho product expression'],
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
    return {
      kind: 'edit',
      target: typeof request !== 'string' ? request.selection?.entityId ?? null : null,
      artifactAction: null,
    }
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

const mockFollowUpPrompts = [
  'hãy phản biện giá trị người dùng',
  'hãy cùng tôi chốt ranh giới',
  'hãy nêu ba tình huống khó',
  'hãy chỉ ra giả định',
  'hãy critique',
]

function mockIdeaContext(request: ReasoningRequest): string {
  const candidates = [
    ...request.recentMessages.filter((message) => message.role === 'user').map((message) => message.content),
    request.message,
  ].reverse()
  return candidates.find((message) => {
    const normalized = message.toLocaleLowerCase('vi').trim()
    return message.trim().length >= 32
      && !normalized.startsWith('/')
      && !mockFollowUpPrompts.some((prompt) => normalized.startsWith(prompt))
      && !/^(vẽ|phác|tạo)\s/iu.test(message.trim())
  }) ?? request.message
}

function compactIdea(value: string, limit = 150): string {
  const compact = value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
  if (compact.length <= limit) return compact
  const candidate = compact.slice(0, limit + 1)
  const boundary = candidate.lastIndexOf(' ')
  return `${candidate.slice(0, boundary > limit * 0.65 ? boundary : limit).trim()}…`
}

function mockConversationReply(request: ReasoningRequest): {
  message: string
  suggestions: ConversationSuggestion[]
} {
  if (request.canvasDiff) {
    const targetLabel = request.selection?.label ? compactIdea(request.selection.label, 96) : ''
    if (request.canvasDiff.changes.length === 0 && targetLabel) {
      return {
        message: `Mình đang nhìn đúng vùng “${targetLabel}”. Bạn chưa đổi hình học hay nội dung; đây là một lượt đưa selection vào ngữ cảnh chat.\n\nVùng này đã nói được trạng thái riêng tư, nhưng có thể làm quyền kiểm soát rõ và tích cực hơn bằng cấu trúc: hiện tại ai được thấy → khi nào mới chia sẻ → người dùng đổi lựa chọn ở đâu. Ví dụ, “Chỉ chia sẻ khi bạn chọn” tạo cảm giác chủ động hơn “Không tự động báo ai”.`,
        suggestions: [
          { id: 'positive-copy', label: 'Đổi sang copy tích cực', prompt: 'Sửa canvas đúng vùng đang chọn: đổi copy để nhấn mạnh quyền chủ động chia sẻ', kind: 'refine' },
          { id: 'compare-copy', label: 'So sánh hai cách viết', prompt: 'Hãy critique hai hướng copy: trấn an bằng phủ định và trao quyền bằng khẳng định', kind: 'explore' },
        ],
      }
    }
    const target = targetLabel ? `, nhất là vùng “${targetLabel}”` : ''
    return {
      message: `Mình đã đọc thay đổi ${request.canvasDiff.fromRevision} → ${request.canvasDiff.toRevision}${target}: ${request.canvasDiff.summary}. Trước khi sửa tiếp, mình muốn kiểm tra một điều: thay đổi này làm outcome của người dùng rõ hơn, hay mới chỉ làm flow chi tiết hơn?`,
      suggestions: [
        { id: 'canvas-impact', label: 'Đánh giá tác động', prompt: 'Hãy đánh giá thay đổi canvas vừa sync theo outcome, rủi ro và phần còn mâu thuẫn', kind: 'explore' },
        { id: 'canvas-refine', label: 'Refine vùng chọn', prompt: 'Hãy refine đúng vùng canvas đang chọn, giữ nguyên các phần còn lại', kind: 'refine' },
      ],
    }
  }

  const current = request.message.toLocaleLowerCase('vi').trim()
  const idea = compactIdea(mockIdeaContext(request))
  const tension = idea.split(/\s+(?:nhưng|tuy nhiên)\s+/iu)
  const tensionStatement = tension.length > 1
    ? `“${compactIdea(tension[0]!, 92)}” nhưng đồng thời “${compactIdea(tension.slice(1).join(' nhưng '), 92)}”`
    : `tạo ra giá trị rõ cho “${idea}” mà không lấy mất quyền chủ động của người dùng`

  if (/phản biện|critique|giả định/iu.test(current)) {
    return {
      message: `Mình sẽ phản biện thẳng vào ý tưởng “${idea}”.\n\nĐiểm mạnh: nhu cầu hỗ trợ đã rõ, và tension cảm xúc đủ khác biệt để định hình sản phẩm.\n\nGiả định nguy hiểm nhất: nhiều nhắc nhở hơn đồng nghĩa với nhiều an tâm hơn. Thực tế, người dùng có thể thấy mình đang bị theo dõi hoặc bị đánh giá.\n\nHướng thử tốt hơn: để người nhận tự sở hữu nhịp tương tác, chọn mức chia sẻ và đặt ngưỡng khi người khác mới được can thiệp. Một prototype đầu tiên nên kiểm chứng đúng khoảnh khắc chuyển từ “tự xử lý” sang “cần hỗ trợ”, chưa cần phủ toàn bộ tính năng.`,
      suggestions: [
        { id: 'set-boundary', label: 'Chốt ranh giới', prompt: 'Hãy cùng tôi chốt ranh giới giữa hỗ trợ và gây áp lực cho ý tưởng này', kind: 'refine' },
        { id: 'hard-scenarios', label: 'Nêu tình huống khó', prompt: 'Hãy nêu ba tình huống khó nhất có thể làm trải nghiệm này phản tác dụng', kind: 'explore' },
        { id: 'sketch-moment', label: 'Phác moment chính', prompt: 'Vẽ user flow tập trung vào khoảnh khắc người dùng tự xử lý và khi họ chủ động nhờ hỗ trợ', kind: 'visualize' },
      ],
    }
  }

  if (/tình huống khó|phản tác dụng|edge case/iu.test(current)) {
    return {
      message: `Ba tình huống đáng thiết kế trước cho “${idea}”:\n\n1. Người dùng đã xử lý ngoài ứng dụng nhưng vẫn bị nhắc, khiến họ mất niềm tin.\n2. Một người thân can thiệp quá sớm, biến hỗ trợ thành áp lực.\n3. Sự im lặng có nhiều nghĩa: bận, không thấy, chủ động bỏ qua hoặc thực sự cần trợ giúp.\n\nMình sẽ không gom cả ba vào một flow ngay. Nên chọn một ngưỡng can thiệp có thể giải thích và cho người dùng quyền đổi ngưỡng đó.`,
      suggestions: [
        { id: 'choose-trigger', label: 'Chọn ngưỡng can thiệp', prompt: 'Giúp tôi chọn một ngưỡng can thiệp đầu tiên và giải thích trade-off', kind: 'refine' },
        { id: 'draw-recovery', label: 'Vẽ flow có recovery', prompt: 'Vẽ user flow có happy path, im lặng, xác nhận muộn và chủ động nhờ hỗ trợ', kind: 'visualize' },
      ],
    }
  }

  if (/chốt ranh giới|quyền riêng tư|gây áp lực/iu.test(current)) {
    return {
      message: `Ranh giới mình đề xuất cho “${idea}”: mặc định người dùng giữ toàn quyền với trạng thái chi tiết; người khác chỉ nhận tín hiệu khi người dùng chủ động chia sẻ hoặc một ngưỡng đã được chính họ đồng ý từ trước bị vượt qua. Không hiển thị điểm số tuân thủ, chuỗi bỏ lỡ hay ngôn ngữ phán xét.\n\nĐiểm cần bạn quyết định là ngưỡng đó dựa trên thời gian, mức độ quan trọng hay một hành động “Tôi cần hỗ trợ”. Đây là lựa chọn sản phẩm, chưa nên để hệ thống tự đoán.`,
      suggestions: [
        { id: 'time-threshold', label: 'Theo thời gian', prompt: 'Khám phá phương án ngưỡng can thiệp theo thời gian và các rủi ro', kind: 'explore' },
        { id: 'ask-for-help', label: 'Chủ động nhờ hỗ trợ', prompt: 'Khám phá phương án chỉ chia sẻ khi người dùng chủ động nhờ hỗ trợ', kind: 'explore' },
        { id: 'visualize-boundary', label: 'Phác hai phương án', prompt: 'Vẽ hai nhánh user flow để so sánh ngưỡng theo thời gian và chủ động nhờ hỗ trợ', kind: 'visualize' },
      ],
    }
  }

  return {
    message: `Mình thấy tension cốt lõi là ${tensionStatement}.\n\nGiả thuyết thiết kế đáng thử: thay vì để hệ thống hoặc người khác nắm quyền kiểm soát, người chịu tác động sẽ chọn nhịp tương tác, mức chia sẻ và thời điểm cần hỗ trợ. Điểm chưa chắc nhất là ranh giới nào khiến sự quan tâm biến thành áp lực.\n\nFeedback hữu ích nhất lúc này: khoảnh khắc nào người dùng vẫn muốn tự xử lý, và khi nào họ thật sự muốn người khác xuất hiện? Canvas sẽ vẫn trống cho đến khi bạn muốn phác một giả thuyết cụ thể.`,
    suggestions: [
      { id: 'challenge-assumption', label: 'Phản biện giả định', prompt: 'Hãy phản biện giá trị người dùng và giả định nguy hiểm nhất của ý tưởng này', kind: 'explore' },
      { id: 'set-boundary', label: 'Chốt ranh giới', prompt: 'Hãy cùng tôi chốt ranh giới giữa hỗ trợ và gây áp lực cho ý tưởng này', kind: 'refine' },
      { id: 'visualize-moment', label: 'Phác moment chính', prompt: 'Vẽ user flow tập trung vào khoảnh khắc người dùng tự xử lý và khi họ chủ động nhờ hỗ trợ', kind: 'visualize' },
    ],
  }
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
    let suggestions: ConversationSuggestion[] = []
    if (request.responseMode === 'route') {
      const collaboration = mockConversationReply(request)
      result.message = collaboration.message
      suggestions = collaboration.suggestions
      // Route turns are lightweight conversation classification only; they must not
      // carry canvas mutation commands. A live provider returns an empty command list
      // in route mode, so the offline mock mirrors that to avoid conversation turns
      // silently mutating canvas/phase (parity with BUG-035/036).
      result.commands = []
    }
    if (request.responseMode === 'figma') {
      if (!request.productSpec) throw new Error('Mock Figma design requires ProductSpec')
      result.intent = { kind: 'artifact', target: null, artifactAction: 'prepare' }
      result.figmaBlueprint = createScaffoldFigmaBlueprint(request.productSpec, request.figmaComponentRoles ?? [])
      result.message = `Đã tạo creative blueprint cho ${result.figmaBlueprint.screens.length} màn hình.`
    }
    if (request.canvasDiff && request.responseMode !== 'route') {
      result.message = `Mình đã đọc phần bạn vừa thay đổi: ${request.canvasDiff.summary}. Vùng chọn và scene hiện tại sẽ là context ưu tiên cho lượt chỉnh tiếp theo.`
    }
    return normalizedResponse(result, null, this.capabilities, suggestions)
  }
}

function providerTimeoutMs(request: ReasoningRequest): number {
  if (request.responseMode === 'figma') return 300_000
  if (request.responseMode === 'creative') return 180_000
  return 120_000
}

/**
 * Runs a provider call under a hard deadline while forwarding user cancellation.
 * The race guarantees the turn settles even if an SDK ignores the AbortSignal, so a
 * stalled provider can never hold the app's single active-turn slot open forever.
 */
async function withProviderDeadline<T>(
  signal: AbortSignal,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const forwardAbort = (): void => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener('abort', forwardAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Provider không phản hồi trong ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([run(controller.signal), deadline])
  } finally {
    if (timer) clearTimeout(timer)
    signal.removeEventListener('abort', forwardAbort)
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
    const response = await withProviderDeadline(signal, providerTimeoutMs(request), (deadlineSignal) => client.responses.create({
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
    }, { signal: deadlineSignal }))
    return normalizedParsedResponse(parseProviderOutput(response.output_text, request), response.id, this.capabilities, response.usage
      ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      : undefined)
  }
}

// AgentRouter (https://agentrouter.org) is an OpenAI-compatible gateway to 30+ models. We reuse
// the OpenAI SDK pointed at its /v1 base URL and use chat.completions + json_schema, which is the
// broadly-supported structured-output path across the aggregated models.
class AgentRouterProvider implements ReasoningProvider {
  readonly id = 'agentrouter'
  readonly capabilities = agentRouterCapabilities
  private static readonly baseURL = 'https://agentrouter.org/v1'

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'AGENTROUTER_API_KEY', 'AgentRouter API key', this.capabilities)
  }

  async reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse> {
    const apiKey = requiredCredential(config.apiKey, 'AGENTROUTER_API_KEY')
    const client = new OpenAI({ apiKey, baseURL: AgentRouterProvider.baseURL })
    let completion
    try {
      completion = await withProviderDeadline(signal, providerTimeoutMs(request), (deadlineSignal) => client.chat.completions.create({
        model: config.modelId,
        messages: [{ role: 'user', content: buildPrompt(request) }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pm_lifecycle_reasoning',
            strict: true,
            schema: outputSchemaFor(request),
          },
        },
      }, { signal: deadlineSignal }))
    } catch (error) {
      throw agentRouterError(error, config.modelId)
    }
    const text = completion.choices[0]?.message?.content ?? ''
    return normalizedParsedResponse(parseProviderOutput(text, request), completion.id, this.capabilities, completion.usage
      ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens }
      : undefined)
  }
}

// AgentRouter (one-api gateway) returns provider-specific 4xx errors. Translate the common ones
// into actionable messages instead of a raw OpenAI stack trace.
function agentRouterError(error: unknown, modelId: string): Error {
  const e = error as { status?: number; code?: string; error?: { message?: string; code?: string }; message?: string }
  const code = e?.code ?? e?.error?.code ?? ''
  const detail = e?.error?.message ?? e?.message ?? 'unknown error'
  if (/content[-_]blocked/i.test(code) || /content[-_]blocked/i.test(detail)) {
    return new Error(
      `AgentRouter chặn request (content-blocked). Thường do model "${modelId}" KHÔNG nằm trong gói của API key hiện tại, `
      + 'hoặc nội dung bị moderation. Hãy đổi model sang một model được phép trong console AgentRouter (agentrouter.org/console).',
    )
  }
  if (e?.status === 401 || e?.status === 403 || /unauthor|invalid.*key|permission/i.test(detail)) {
    return new Error('AgentRouter từ chối xác thực/quyền — kiểm tra AGENTROUTER_API_KEY và quyền truy cập model.')
  }
  if (e?.status === 404 || /model.*not.*found|no.*such.*model/i.test(detail)) {
    return new Error(`AgentRouter không tìm thấy model "${modelId}" — đặt lại model theo catalog AgentRouter.`)
  }
  return new Error(`AgentRouter lỗi ${e?.status ?? ''}: ${detail}`)
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
    const response = await withProviderDeadline(signal, providerTimeoutMs(request), (deadlineSignal) => client.models.generateContent({
      model: config.modelId,
      contents: buildPrompt(request),
      config: {
        abortSignal: deadlineSignal,
        responseMimeType: 'application/json',
        responseJsonSchema: outputSchemaFor(request),
      },
    }))
    const usage = response.usageMetadata
    return normalizedParsedResponse(parseProviderOutput(response.text ?? '', request), null, this.capabilities, usage
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
    const response = await withProviderDeadline(signal, providerTimeoutMs(request), (deadlineSignal) => client.messages.create({
      model: config.modelId,
      max_tokens: request.responseMode === 'figma'
        ? 16_000
        : request.responseMode === 'creative'
          ? 8_000
          : 1_400,
      system: systemPolicy,
      messages: [{ role: 'user', content: buildPrompt(request) }],
      output_config: {
        format: { type: 'json_schema', schema: outputSchemaFor(request) },
      },
    }, { signal: deadlineSignal }))
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return normalizedParsedResponse(parseProviderOutput(text, request), response.id, this.capabilities, {
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
      return normalizedParsedResponse(parseProviderOutput(output, request), threadId, this.capabilities)
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
      new AgentRouterProvider(),
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
