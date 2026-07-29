import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  figmaDesignSystemCaptureSchema,
  figmaIconCatalogSchema,
  figmaPagesSchema,
  figmaApplyResultSchema,
  figmaArtifactAuditResultSchema,
  figmaArtifactSnapshotSchema,
  figmaPreflightResultSchema,
  figmaRuntimeErrorEnvelopeSchema,
  figmaRuntimeHealthSchema,
  figmaCraftAuditSchema,
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
  type FigmaCraftAudit,
  type FigmaIconCatalog,
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

interface FigmaScannedNode { id: string; name: string; type: string }

// `scan_nodes_by_types` has returned results under a few keys across runtime versions
// (matchingNodes / nodes / results) or as a bare array; normalise them all to `{ nodes }`.
const figmaScanNodesResultSchema: Schema<{ nodes: FigmaScannedNode[] }> = {
  parse(value: unknown) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
    const raw = Array.isArray(value) ? value : source?.matchingNodes ?? source?.nodes ?? source?.results ?? []
    const list = Array.isArray(raw) ? raw : []
    const nodes: FigmaScannedNode[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      if (typeof record.id === 'string' && typeof record.name === 'string' && typeof record.type === 'string') {
        nodes.push({ id: record.id, name: record.name, type: record.type })
      }
    }
    return { nodes }
  },
}

const ICON_PAGE_NAME = /icon/i
const ICON_NAME = /(?:^|_)ic_|^zi_|icon/i
const ICON_CATALOG_LIMIT = 260

function iconNamePrefixes(names: string[]): string[] {
  const prefixes = new Set<string>()
  for (const name of names) {
    const match = name.match(/^(zi_zds_ic_|zi_ic_|zds_ic_|ic_|icon[_/])/i)
    if (match?.[1]) prefixes.add(match[1].toLowerCase())
  }
  return [...prefixes].sort()
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

export interface FigmaToolResult {
  content?: unknown
  isError?: unknown
}

// Interpret an MCP tool result into its JSON payload, or throw a FigmaMcpError that carries the
// real reason. Tool-level failures arrive as `isError` results whose text is EITHER a JSON error
// envelope OR a bare string (the runtime's `mcp.NewToolResultError` writes plain text). We must
// inspect `isError` BEFORE attempting to parse — otherwise a plain-text tool error (e.g.
// "mode must be strict or free") gets masked as an opaque "returned invalid JSON".
export function interpretFigmaToolResult(name: string, result: FigmaToolResult): unknown {
  const content = Array.isArray(result.content) ? result.content : []
  const textBlock = content.find((item): item is { type: 'text'; text: string } => (
    typeof item === 'object' && item !== null
    && 'type' in item && item.type === 'text'
    && 'text' in item && typeof item.text === 'string'
  ))
  const text = textBlock?.text
  if (!text) throw new FigmaMcpError(`Figma MCP tool ${name} returned no JSON text`, 'INTERNAL_ERROR', false)

  if (result.isError === true) {
    let errorPayload: unknown = null
    try {
      errorPayload = JSON.parse(text)
    } catch {
      errorPayload = null
    }
    const envelope = errorPayload !== null ? figmaRuntimeErrorEnvelopeSchema.safeParse(errorPayload) : null
    if (envelope?.success) {
      throw new FigmaMcpError(envelope.data.error.message, envelope.data.error.code, envelope.data.error.retryable)
    }
    throw new FigmaMcpError(`Figma MCP tool ${name} failed: ${text.trim().slice(0, 600)}`, 'PLUGIN_ERROR', false)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new FigmaMcpError(`Figma MCP tool ${name} returned invalid JSON: ${text.trim().slice(0, 300)}`, 'INTERNAL_ERROR', false)
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
    return interpretFigmaToolResult(name, result as FigmaToolResult)
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

// `reference` is a host-side planning concept ("prefer the ZDS ref, fall back to primitives,
// never block"). The Figma runtime's strict preflight only understands `strict` | `free` and
// resolves non-strict modes identically, so a `reference` plan must reach it as `free`. The
// runtime echoes this mode into its immutable preflight result, so the approved plan hash and
// every downstream apply stay internally consistent. The host label stays `reference` via the
// action's guardMode — this only normalizes the value crossing the runtime boundary.
function runtimeArtifactPlan(plan: FigmaArtifactPlan): FigmaArtifactPlan {
  return plan.mode === 'reference' ? { ...plan, mode: 'free' } : plan
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
    creativeMode: FigmaTargetBinding['creativeMode'] = 'zds',
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

    const target = {
      sessionId,
      fileName: session.fileName,
      pageId: page.id,
      pageName: page.name,
      ...(creativeMode === 'free' ? { creativeMode } : {}),
    }
    return figmaTargetBindingSchema.parse({
      schemaVersion: 1,
      ...target,
      targetHash: targetHash(target),
      allowedAt,
    })
  }

  async pinTarget(
    sessionId: string,
    pageId: string,
    allowedAt = new Date().toISOString(),
    creativeMode: FigmaTargetBinding['creativeMode'] = 'zds',
  ): Promise<FigmaTargetBinding> {
    return this.resolveTarget(sessionId, pageId, allowedAt, true, creativeMode)
  }

  async verifyTarget(target: FigmaTargetBinding): Promise<FigmaTargetBinding> {
    const verifiedAt = this.verifiedTargets.get(target.targetHash)
    if (verifiedAt && Date.now() - verifiedAt < 10_000) return target
    const verified = await this.resolveTarget(target.sessionId, target.pageId, target.allowedAt, false, target.creativeMode ?? 'zds')
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

  // Best-effort ZDS icon inventory. ZDS keeps icons as COMPONENT_SET nodes (e.g. `zi_zds_ic_*`)
  // on a dedicated "Icon" Page, separate from the component Page the manifest is captured from.
  // We scan them cross-page by node id (no navigation, no side effect on the user's view) so the
  // craft worker can instantiate real icons. Never throws — returns null on any failure so a
  // missing/odd icon Page can never block the design flow.
  async captureIconCatalog(target: FigmaTargetBinding): Promise<FigmaIconCatalog | null> {
    try {
      await this.verifyTarget(target)
      const pages = await this.pages(target.sessionId)
      const iconPages = pages.pages.filter((page) => ICON_PAGE_NAME.test(page.name))
      if (iconPages.length === 0) return null

      const icons = new Map<string, string>()
      let sourcePage: { id: string; name: string } | null = null
      for (const page of iconPages) {
        if (icons.size >= ICON_CATALOG_LIMIT) break
        let scanned
        try {
          scanned = await this.call('scan_nodes_by_types', {
            sessionId: target.sessionId,
            nodeId: page.id,
            types: ['COMPONENT_SET', 'COMPONENT'],
            maxVisited: 60_000,
            maxTimeMs: 30_000,
          }, figmaScanNodesResultSchema, 60_000)
        } catch {
          continue
        }
        const before = icons.size
        // Prefer COMPONENT_SET (a whole icon with its variants); accept standalone COMPONENTs
        // only when they are not variant children (variant names contain "=") and read as icons.
        for (const node of scanned.nodes) {
          if (node.type !== 'COMPONENT_SET') continue
          if (!icons.has(node.name)) icons.set(node.name, node.id)
        }
        for (const node of scanned.nodes) {
          if (node.type !== 'COMPONENT' || node.name.includes('=')) continue
          if (!icons.has(node.name) && ICON_NAME.test(node.name)) icons.set(node.name, node.id)
        }
        if (icons.size > before && !sourcePage) sourcePage = { id: page.id, name: page.name }
      }
      if (icons.size === 0 || !sourcePage) return null

      const entries = [...icons.entries()]
        .map(([name, setId]) => ({ name, setId }))
        .sort((left, right) => left.name.localeCompare(right.name))
      return figmaIconCatalogSchema.parse({
        pageId: sourcePage.id,
        pageName: sourcePage.name,
        namePrefixes: iconNamePrefixes(entries.map((entry) => entry.name)),
        count: entries.length,
        icons: entries.slice(0, ICON_CATALOG_LIMIT),
      })
    } catch {
      return null
    }
  }

  async preflightArtifactPlan(
    plan: FigmaArtifactPlan,
    manifest: DesignSystemManifest,
    allowedTarget: FigmaTargetBinding,
  ): Promise<FigmaPreflightResult> {
    await this.verifyTarget(allowedTarget)
    return this.call('plan_design_system_screens', {
      sessionId: allowedTarget.sessionId,
      artifactPlan: runtimeArtifactPlan(plan),
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

  async auditProductCraft(input: {
    target: FigmaTargetBinding
    rootNodeId: string
    expectedScreenCount: number
    expectedPrototypeLinks: number
    forbiddenTerms: string[]
    placeholderTerms?: string[]
    requireZdsInstances?: boolean
    surfaceMode?: 'mobile' | 'adaptive'
  }): Promise<FigmaCraftAudit> {
    await this.verifyTarget(input.target)
    return this.call('audit_product_craft', {
      sessionId: input.target.sessionId,
      rootNodeId: input.rootNodeId,
      expectedScreenCount: input.expectedScreenCount,
      expectedPrototypeLinks: input.expectedPrototypeLinks,
      forbiddenTerms: input.forbiddenTerms,
      ...(input.requireZdsInstances !== undefined ? { requireZdsInstances: input.requireZdsInstances } : {}),
      ...(input.surfaceMode ? { surfaceMode: input.surfaceMode } : {}),
      ...(input.placeholderTerms ? { placeholderTerms: input.placeholderTerms } : {}),
    }, figmaCraftAuditSchema, 60_000)
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
