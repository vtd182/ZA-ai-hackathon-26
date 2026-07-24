import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  figmaDesignSystemCaptureSchema,
  figmaPagesSchema,
  figmaApplyResultSchema,
  figmaArtifactAuditResultSchema,
  figmaArtifactSnapshotSchema,
  figmaPreflightResultSchema,
  figmaRuntimeErrorEnvelopeSchema,
  figmaRuntimeHealthSchema,
  figmaTargetBindingSchema,
  type FigmaDesignSystemCapture,
  type FigmaPages,
  type FigmaApplyResult,
  type FigmaArtifactAuditResult,
  type FigmaArtifactSnapshot,
  type FigmaArtifactPlan,
  type FigmaPreflightResult,
  type DesignSystemManifest,
  type FigmaRuntimeErrorCode,
  type FigmaRuntimeHealth,
  type FigmaTargetBinding,
} from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'

export interface FigmaMcpOptions {
  binaryPath: string
  host?: string
  port?: number
}

interface Schema<T> {
  parse(value: unknown): T
}

export interface FigmaJsonToolTransport {
  connect(): Promise<void>
  callJson(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown>
  close(): Promise<void>
}

export const FIGMA_APPLY_MIN_TIMEOUT_MS = 5 * 60_000
export const FIGMA_APPLY_MAX_TIMEOUT_MS = 30 * 60_000
export const FIGMA_APPLY_OPERATION_TIMEOUT_MS = 5_000

export function figmaApplyTimeoutMs(estimatedOperations: number): number {
  const operations = Number.isFinite(estimatedOperations) ? Math.max(0, Math.floor(estimatedOperations)) : 0
  return Math.min(
    FIGMA_APPLY_MAX_TIMEOUT_MS,
    FIGMA_APPLY_MIN_TIMEOUT_MS + operations * FIGMA_APPLY_OPERATION_TIMEOUT_MS,
  )
}

export class FigmaMcpError extends Error {
  constructor(
    message: string,
    readonly code: FigmaRuntimeErrorCode,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'FigmaMcpError'
  }
}

class SdkFigmaJsonToolTransport implements FigmaJsonToolTransport {
  private readonly client = new Client({ name: 'pm-lifecycle-agent', version: '0.1.0' })
  private readonly transport: StdioClientTransport
  private connected = false

  constructor(options: FigmaMcpOptions) {
    const inheritedEnv = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
    this.transport = new StdioClientTransport({
      command: options.binaryPath,
      args: ['--ip', options.host ?? '127.0.0.1', '--port', String(options.port ?? 1802)],
      env: { ...inheritedEnv, ZA_LOG_LEVEL: 'warn', ZA_LOG_FORMAT: 'text' },
      stderr: 'pipe',
    })
  }

  async connect(): Promise<void> {
    if (this.connected) return
    await this.client.connect(this.transport)
    this.connected = true
  }

  async callJson(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    await this.connect()
    let result
    try {
      result = await this.client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs })
    } catch (error) {
      throw new FigmaMcpError(error instanceof Error ? error.message : 'Figma MCP transport failed', 'TRANSPORT_ERROR', true)
    }

    const resultRecord = result as { content?: unknown; isError?: unknown }
    const content = Array.isArray(resultRecord.content) ? resultRecord.content : []
    const textBlock = content.find((item): item is { type: 'text'; text: string } => (
      typeof item === 'object' && item !== null
      && 'type' in item && item.type === 'text'
      && 'text' in item && typeof item.text === 'string'
    ))
    const text = textBlock?.text
    if (!text) throw new FigmaMcpError(`Figma MCP tool ${name} returned no JSON text`, 'INTERNAL_ERROR', false)

    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      throw new FigmaMcpError(`Figma MCP tool ${name} returned invalid JSON`, 'INTERNAL_ERROR', false)
    }

    if (resultRecord.isError === true) {
      const envelope = figmaRuntimeErrorEnvelopeSchema.safeParse(payload)
      if (envelope.success) {
        throw new FigmaMcpError(envelope.data.error.message, envelope.data.error.code, envelope.data.error.retryable)
      }
      throw new FigmaMcpError(`Figma MCP tool ${name} failed`, 'PLUGIN_ERROR', false)
    }
    return payload
  }

  async close(): Promise<void> {
    if (!this.connected) return
    this.connected = false
    await this.client.close()
  }
}

function targetHash(target: Omit<FigmaTargetBinding, 'schemaVersion' | 'targetHash' | 'allowedAt'>): string {
  return createHash('sha256').update(stableStringify(target as unknown as JsonValue)).digest('hex')
}

export class FigmaMcpAdapter {
  private readonly transport: FigmaJsonToolTransport
  private readonly verifiedTargets = new Map<string, number>()

  constructor(options: FigmaMcpOptions, transport?: FigmaJsonToolTransport) {
    this.transport = transport ?? new SdkFigmaJsonToolTransport(options)
  }

  async health(): Promise<FigmaRuntimeHealth> {
    return this.call('get_runtime_health', {}, figmaRuntimeHealthSchema, 5_000)
  }

  async pages(sessionId: string): Promise<FigmaPages> {
    return this.call('get_pages', { sessionId }, figmaPagesSchema, 8_000)
  }

  private async resolveTarget(
    sessionId: string,
    pageId: string,
    allowedAt: string,
    requireCurrentPage: boolean,
  ): Promise<FigmaTargetBinding> {
    const health = await this.health()
    if (!health.pluginConnected) throw new FigmaMcpError('Figma plugin chưa kết nối.', 'PLUGIN_NOT_CONNECTED', true)
    const session = health.sessions.find((item) => item.sessionId === sessionId)
    if (!session) throw new FigmaMcpError('Figma session không còn tồn tại.', 'VALIDATION_ERROR', false)

    const pages = await this.pages(sessionId)
    const page = pages.pages.find((item) => item.id === pageId)
    if (!page) throw new FigmaMcpError('Figma page không thuộc session đã chọn.', 'VALIDATION_ERROR', false)
    if (requireCurrentPage && (session.pageName !== page.name || pages.currentPageId !== page.id)) {
      throw new FigmaMcpError('Hãy mở đúng page cần allowlist trong Figma rồi thử lại.', 'VALIDATION_ERROR', false)
    }

    const target = { sessionId, fileName: session.fileName, pageId: page.id, pageName: page.name }
    return figmaTargetBindingSchema.parse({
      schemaVersion: 1,
      ...target,
      targetHash: targetHash(target),
      allowedAt,
    })
  }

  async pinTarget(sessionId: string, pageId: string, allowedAt = new Date().toISOString()): Promise<FigmaTargetBinding> {
    return this.resolveTarget(sessionId, pageId, allowedAt, true)
  }

  async verifyTarget(target: FigmaTargetBinding): Promise<FigmaTargetBinding> {
    const verifiedAt = this.verifiedTargets.get(target.targetHash)
    if (verifiedAt && Date.now() - verifiedAt < 10_000) return target
    const verified = await this.resolveTarget(target.sessionId, target.pageId, target.allowedAt, false)
    if (verified.targetHash !== target.targetHash || verified.fileName !== target.fileName || verified.pageName !== target.pageName) {
      throw new FigmaMcpError('Figma target không còn khớp allowlist đã duyệt.', 'VALIDATION_ERROR', false)
    }
    this.verifiedTargets.set(target.targetHash, Date.now())
    return verified
  }

  async captureDesignSystem(target: FigmaTargetBinding): Promise<FigmaDesignSystemCapture> {
    await this.verifyTarget(target)
    return this.call('capture_design_system_context', {
      sessionId: target.sessionId,
      sourcePageId: target.pageId,
    }, figmaDesignSystemCaptureSchema, 180_000)
  }

  async preflightArtifactPlan(
    plan: FigmaArtifactPlan,
    manifest: DesignSystemManifest,
    allowedTarget: FigmaTargetBinding,
  ): Promise<FigmaPreflightResult> {
    await this.verifyTarget(allowedTarget)
    return this.call('plan_design_system_screens', {
      sessionId: allowedTarget.sessionId,
      artifactPlan: plan,
      manifest,
      allowedTarget,
    }, figmaPreflightResultSchema, 60_000)
  }

  async applyArtifactPlan(preflight: FigmaPreflightResult, approvedPlanHash: string): Promise<FigmaApplyResult> {
    await this.verifyTarget(preflight.plan.source.target)
    const timeoutMs = figmaApplyTimeoutMs(preflight.plan.estimatedOperations)
    return this.call('apply_design_system_plan', {
      sessionId: preflight.plan.source.target.sessionId,
      preflight,
      planHash: preflight.planHash,
      approvedPlanHash,
    }, figmaApplyResultSchema, timeoutMs)
  }

  async readArtifact(target: FigmaTargetBinding, idempotencyKey: string, rootNodeId?: string): Promise<FigmaArtifactSnapshot> {
    await this.verifyTarget(target)
    return this.call('read_lifecycle_artifact', {
      sessionId: target.sessionId,
      targetPageId: target.pageId,
      idempotencyKey,
      ...(rootNodeId ? { rootNodeId } : {}),
    }, figmaArtifactSnapshotSchema, 180_000)
  }

  async auditArtifact(preflight: FigmaPreflightResult): Promise<FigmaArtifactAuditResult> {
    await this.verifyTarget(preflight.plan.source.target)
    return this.call('audit_lifecycle_artifact', {
      sessionId: preflight.plan.source.target.sessionId,
      preflight,
      planHash: preflight.planHash,
    }, figmaArtifactAuditResultSchema, 20_000)
  }

  close(): Promise<void> {
    this.verifiedTargets.clear()
    return this.transport.close()
  }

  private async call<T>(name: string, args: Record<string, unknown>, schema: Schema<T>, timeoutMs: number): Promise<T> {
    const payload = await this.transport.callJson(name, args, timeoutMs)
    try {
      return schema.parse(payload)
    } catch (error) {
      throw new FigmaMcpError(
        `Figma MCP response contract mismatch for ${name}: ${error instanceof Error ? error.message : 'unknown schema error'}`,
        'INTERNAL_ERROR',
        false,
      )
    }
  }
}
