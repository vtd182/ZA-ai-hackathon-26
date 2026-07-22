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
  type ChatMessage,
  type ProviderProbe,
  type PhaseReasoningResult,
  type WorkflowView,
} from '@pm-agent/domain'

const execFileAsync = promisify(execFile)

export interface ReasoningRequest {
  threadId: string
  phase: WorkflowView
  message: string
  recentMessages: ChatMessage[]
  selection?: CanvasSelectionContext
  remoteRef: string | null
}

export interface ProviderRuntimeConfig {
  modelId: string
  apiKey?: string
}

export interface ProviderResponse {
  result: PhaseReasoningResult
  remoteRef: string | null
}

export interface ReasoningProvider {
  readonly id: string
  probe(config: ProviderRuntimeConfig): Promise<ProviderProbe>
  reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse>
}

const systemPolicy = `Bạn là reasoning provider cho PM Lifecycle Agent.
Mục tiêu: giúp PM biến ý tưởng thành ProductSpec có traceability và thay đổi scope có kiểm soát.
Chỉ trả về JSON đúng schema được cung cấp. Không dùng markdown.
Mỗi command luôn có đủ type, label, query, view; field không áp dụng phải là null.
Luôn trả phase đúng phase hiện tại và phaseData đúng schema phase được cung cấp.
Các lệnh canvas chỉ là đề xuất hiển thị; không tuyên bố đã ghi Figma, Jira hay Zdoc.
Trả lời bằng tiếng Việt, ngắn gọn, nêu outcome và bước quyết định tiếp theo.
Khi người dùng yêu cầu bỏ một scope, dùng remove_card. Khi yêu cầu thêm, dùng add_card.
Khi yêu cầu xem một vùng, dùng switch_view. Khi muốn tìm/nhấn mạnh entity, dùng focus_card.`

function buildPrompt(request: ReasoningRequest): string {
  const transcript = request.recentMessages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n')
  const selection = request.selection
    ? `Canvas đang chọn: ${request.selection.entityId} (${request.selection.label})`
    : 'Canvas không có entity được chọn.'
  return `${systemPolicy}\n\nPhase hiện tại: ${request.phase}\n${selection}\n\nLịch sử gần đây:\n${transcript}\n\nYêu cầu mới:\n${request.message}`
}

function parseProviderText(text: string, phase: WorkflowView): PhaseReasoningResult {
  try {
    return parsePhaseReasoningResult(extractJson(text), phase)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid output'
    throw new Error(`Provider trả về dữ liệu không đúng schema: ${detail}`)
  }
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

  if (/(bo|xoa|remove|loai)/.test(normalized)) {
    const query = /(payment|thanh toan|vi noi bo)/.test(normalized) ? 'payment' : message.replace(/^(hãy\s+)?(bỏ|xóa|remove|loại)\s*/i, '').trim()
    if (query) commands.push({ type: 'remove_card', query })
  } else if (/(them|add|tao card)/.test(normalized)) {
    const label = message.replace(/^(hãy\s+)?(thêm|add|tạo card)\s*/i, '').trim()
    if (label) commands.push({ type: 'add_card', label, view: matchedView?.[0] ?? 'discover' })
  } else if (/(focus|tim|chon|nhan manh)/.test(normalized)) {
    const query = /(payment|thanh toan|vi noi bo)/.test(normalized) ? 'payment' : message
    commands.push({ type: 'focus_card', query })
  }

  const messageText = commands.length > 0
    ? 'Mình đã tạo đề xuất trên canvas. Thay đổi business scope vẫn cần được review trước khi đồng bộ artifact.'
    : 'Mình đã ghi nhận. Hãy bổ sung target user, mục tiêu đo lường hoặc constraint quan trọng để tiếp tục discovery.'
  return { schemaVersion: 1, phase, message: messageText, commands, phaseData: phaseData(phase, normalized) } as PhaseReasoningResult
}

class MockProvider implements ReasoningProvider {
  readonly id = 'mock'

  async probe(): Promise<ProviderProbe> {
    return { available: true, label: 'Sẵn sàng', detail: 'Deterministic offline provider' }
  }

  async reason(request: ReasoningRequest): Promise<ProviderResponse> {
    return { result: inferLocalCommands(request.message, request.phase), remoteRef: null }
  }
}

class OpenAIProvider implements ReasoningProvider {
  readonly id = 'openai'

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'OPENAI_API_KEY', 'OpenAI API key')
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
          schema: reasoningJsonSchemaForPhase(request.phase),
        },
      },
    }, { signal })
    return { result: parseProviderText(response.output_text, request.phase), remoteRef: response.id }
  }
}

class GeminiProvider implements ReasoningProvider {
  readonly id = 'gemini'

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'GEMINI_API_KEY', 'Gemini API key')
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
        responseJsonSchema: reasoningJsonSchemaForPhase(request.phase),
      },
    })
    return { result: parseProviderText(response.text ?? '', request.phase), remoteRef: null }
  }
}

class AnthropicProvider implements ReasoningProvider {
  readonly id = 'anthropic'

  async probe(config: ProviderRuntimeConfig): Promise<ProviderProbe> {
    return credentialProbe(config.apiKey, 'ANTHROPIC_API_KEY', 'Anthropic API key')
  }

  async reason(request: ReasoningRequest, config: ProviderRuntimeConfig, signal: AbortSignal): Promise<ProviderResponse> {
    const apiKey = requiredCredential(config.apiKey, 'ANTHROPIC_API_KEY')
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: config.modelId,
      max_tokens: 1400,
      system: systemPolicy,
      messages: [{ role: 'user', content: buildPrompt(request) }],
      output_config: {
        format: { type: 'json_schema', schema: reasoningJsonSchemaForPhase(request.phase) },
      },
    }, { signal })
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return { result: parseProviderText(text, request.phase), remoteRef: response.id }
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

  async probe(): Promise<ProviderProbe> {
    try {
      const { stdout } = await execFileAsync('codex', ['--version'], { timeout: 5_000 })
      return { available: true, label: 'Sẵn sàng', detail: stdout.trim() }
    } catch {
      return { available: false, label: 'Không khả dụng', detail: 'Không tìm thấy Codex CLI hoặc phiên đăng nhập.' }
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
        const timeout = setTimeout(() => reject(new Error('Codex timeout sau 120 giây')), 120_000)
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
        outputSchema: reasoningJsonSchemaForPhase(request.phase),
      })
      await completed
      return { result: parseProviderText(output, request.phase), remoteRef: threadId }
    } finally {
      signal.removeEventListener('abort', abort)
      client.stop()
    }
  }
}

function credentialProbe(apiKey: string | undefined, envName: string, label: string): ProviderProbe {
  const present = Boolean(apiKey || process.env[envName])
  return present
    ? { available: true, label: 'Đã cấu hình', detail: `${label} có sẵn trong Keychain hoặc environment.` }
    : { available: false, label: 'Thiếu API key', detail: `Nhập ${label} trong Settings hoặc đặt ${envName}.` }
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
