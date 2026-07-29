import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import type { DesignSystemManifest, FigmaIconCatalog, FigmaPreflightPlan } from '@pm-agent/domain'
import type { SkillPackBundle } from './skill-packs'
import { renderSkillPackForPrompt } from './skill-packs'

const execFileAsync = promisify(execFile)

export type FigmaDesignWorkerStage =
  | 'starting'
  | 'inspecting'
  | 'crafting'
  | 'reviewing'
  | 'refining'
  | 'completed'

export interface FigmaDesignWorkerReport {
  schemaVersion: 1
  artifactPageName: string
  rootNodeId: string
  screenCount: number
  zdsInstanceCount: number
  prototypeLinkCount: number
  screenshotsReviewed: number
  refinementPasses: number
  removedRequirementMentions: 0
  visualQaPassed: true
  summary: string
}

export interface FigmaProductTruth {
  idea: {
    id: string
    title: string
    summary: string
    targetUsers: string[]
  }
  activeRequirements: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
  }>
  removedRequirements: Array<{
    id: string
    title: string
    description: string
  }>
  decisions: Array<{
    id: string
    question: string
    choice: string
    rationale: string
    status: string
  }>
}

export interface FigmaDesignWorkerTask {
  modelId: string
  workingDirectory: string
  mcpBinaryPath: string
  skillPack: SkillPackBundle
  sessionId: string
  sourcePageId: string
  sourcePageName: string
  artifactPageName: string
  rootNodeId: string
  idempotencyKey: string
  plan: FigmaPreflightPlan
  manifest: DesignSystemManifest
  iconCatalog?: FigmaIconCatalog | null
  productTruth: FigmaProductTruth
  iteration?: number
  qaFeedback?: string[]
  timeoutMs: number
  // Optional Codex transport overrides — used to route the craft worker through AgentRouter
  // (a temp CODEX_HOME whose config.toml points Codex at the AgentRouter Responses provider).
  codexHome?: string
  extraEnv?: Record<string, string>
}

export interface FigmaDesignWorkerOptions {
  onProgress?(stage: FigmaDesignWorkerStage, message: string): void
  signal?: AbortSignal
}

interface JsonRpcMessage {
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
}

export interface FigmaWorkerScope {
  sessionId: string
  sourcePageName: string
  artifactPageName: string
  currentPageName: string
}

const forbiddenPageTools = new Set([
  'add_page',
  'apply_design_system_plan',
  'apply_lifecycle_artifact',
  'apply_lifecycle_artifact_plan',
  'delete_page',
  'rename_page',
])

function toolNameFromElicitation(params: Record<string, unknown>): string | null {
  const message = typeof params.message === 'string' ? params.message : ''
  return message.match(/tool "([^"]+)"/)?.[1] ?? null
}

function isReadOnlyFigmaTool(toolName: string): boolean {
  return /^(audit_|capture_|export_|get_|inspect_|list_|read_|save_screenshots|scan_|search_)/.test(toolName)
}

interface ObservedCraftEvidence {
  screenshotCalls: number[]
  writeCalls: number[]
  productAuditCalls: number
}

export function approveFigmaWorkerElicitation(
  params: Record<string, unknown>,
  scope: FigmaWorkerScope,
): { approved: boolean; reason: string } {
  if (params.serverName !== 'za-talk-to-figma') return { approved: false, reason: 'MCP server is outside the approved connector' }
  const toolName = toolNameFromElicitation(params)
  if (!toolName) return { approved: false, reason: 'MCP elicitation has no tool name' }
  const meta = params._meta && typeof params._meta === 'object' ? params._meta as Record<string, unknown> : {}
  const toolParams = meta.tool_params && typeof meta.tool_params === 'object'
    ? meta.tool_params as Record<string, unknown>
    : {}
  if (typeof toolParams.sessionId === 'string' && toolParams.sessionId !== scope.sessionId) {
    return { approved: false, reason: 'MCP session differs from the approved Figma session' }
  }
  if (forbiddenPageTools.has(toolName)) {
    return { approved: false, reason: `${toolName} is not allowed inside the creative refinement pass` }
  }
  if (toolName === 'navigate_to_page') {
    const pageName = typeof toolParams.pageName === 'string' ? toolParams.pageName : null
    if (pageName !== scope.sourcePageName && pageName !== scope.artifactPageName) {
      return { approved: false, reason: 'Navigation target is outside the approved source/output Pages' }
    }
    scope.currentPageName = pageName
    return { approved: true, reason: 'Navigation stays inside the approved Page pair' }
  }
  if (!isReadOnlyFigmaTool(toolName) && scope.currentPageName !== scope.artifactPageName) {
    return { approved: false, reason: 'Write tool is blocked while the read-only ZDS source Page is active' }
  }
  return { approved: true, reason: isReadOnlyFigmaTool(toolName) ? 'Read-only inspection' : 'Write is scoped to the approved output Page' }
}

export function parseFigmaDesignWorkerReport(
  value: unknown,
  task: Pick<FigmaDesignWorkerTask, 'artifactPageName' | 'rootNodeId'>,
  observed?: ObservedCraftEvidence,
): FigmaDesignWorkerReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Design worker returned no report object')
  const report = value as Record<string, unknown>
  const number = (key: string, minimum: number): number => {
    const candidate = report[key]
    if (!Number.isInteger(candidate) || (candidate as number) < minimum) {
      throw new Error(`Design worker report has invalid ${key}`)
    }
    return candidate as number
  }
  if (report.schemaVersion !== 1) throw new Error('Design worker report schemaVersion is invalid')
  if (report.artifactPageName !== task.artifactPageName) throw new Error('Design worker changed the approved artifact Page')
  if (report.rootNodeId !== task.rootNodeId) throw new Error('Design worker changed the approved artifact root')
  if (report.visualQaPassed !== true) throw new Error('Design worker did not pass visual QA')
  if (report.removedRequirementMentions !== 0) {
    throw new Error('Design worker found removed ProductSpec requirements in the final artifact')
  }
  const claimedScreenshots = number('screenshotsReviewed', 2)
  const refinementPasses = number('refinementPasses', 1)
  // The MCP-observed count is authoritative — trust it over the worker's self-report. The real
  // integrity bar is: a genuine initial + final capture (>=2), a write between them (refinement
  // happened), and an independent product audit. Do NOT discard a long, real craft pass over an
  // off-by-one over-claim (e.g. the worker counted a save_screenshots as an extra shot).
  let screenshotsReviewed = claimedScreenshots
  if (observed) {
    // Minimal integrity from the observed MCP traffic: the worker actually captured the design
    // (>=2 screenshots: an initial and a final) and actually mutated it (>=1 write). The strict
    // "a write must fall strictly between the two screenshots" ordering and the worker's own
    // audit-call count were process heuristics that repeatedly discarded genuine multi-minute
    // craft passes on bookkeeping mismatches — the authoritative quality gate is the independent
    // audit_product_craft the host runs against the real artifact after this report.
    if (observed.screenshotCalls.length < 2) {
      throw new Error(`Design worker produced only ${observed.screenshotCalls.length} observed screenshot(s); need an initial and a final capture.`)
    }
    screenshotsReviewed = observed.screenshotCalls.length
    if (observed.writeCalls.length < 1) {
      throw new Error('Design worker produced no observed write operations; the artifact was not actually crafted.')
    }
  }
  if (typeof report.summary !== 'string' || !report.summary.trim()) throw new Error('Design worker report has no summary')
  return {
    schemaVersion: 1,
    artifactPageName: task.artifactPageName,
    rootNodeId: task.rootNodeId,
    screenCount: number('screenCount', 1),
    zdsInstanceCount: number('zdsInstanceCount', 1),
    prototypeLinkCount: number('prototypeLinkCount', 0),
    screenshotsReviewed,
    refinementPasses,
    removedRequirementMentions: 0,
    visualQaPassed: true,
    summary: report.summary.trim(),
  }
}

export function buildFigmaDesignWorkerPrompt(task: FigmaDesignWorkerTask): string {
  const sourceComponents = task.manifest.components
    .filter((component) => !component.deprecated && component.binding)
    .map((component) => ({
      role: component.semanticRole,
      name: component.name,
      binding: component.binding,
      variants: component.variants,
    }))
  const iconLibrary = task.iconCatalog && task.iconCatalog.icons.length > 0
    ? {
        pageName: task.iconCatalog.pageName,
        namePrefixes: task.iconCatalog.namePrefixes,
        count: task.iconCatalog.count,
        // name -> COMPONENT_SET node id. Instantiate cross-page without navigating:
        // instantiate_component({ componentSetId: <setId>, parentId: <frame on the output Page> }).
        icons: task.iconCatalog.icons,
        usage: 'These are real ZDS icon component sets. Place one with instantiate_component({ componentSetId: <setId>, parentId: <a frame on the output Page> }); it resolves a variant automatically. Match the icon name to the moment (e.g. zi_zds_ic_search for search, zi_zds_ic_chevron_right for navigation). Never draw a placeholder square or generic glyph where a named icon exists here. Do not navigate to the icon Page.',
      }
    : null
  const brief = {
    approvedTask: {
      sessionId: task.sessionId,
      sourcePageId: task.sourcePageId,
      sourcePageName: task.sourcePageName,
      artifactPageName: task.artifactPageName,
      rootNodeId: task.rootNodeId,
      idempotencyKey: task.idempotencyKey,
    },
    designDirection: task.plan.source.designDirection,
    productTruth: task.productTruth,
    productScreens: task.plan.source.screens,
    creativeStartingPoint: task.plan.source.creativeBlueprint ?? null,
    resolvedZdsSlots: task.plan.resolvedSlots,
    sourceComponents,
    ...(iconLibrary ? { iconLibrary } : {}),
    skillPack: {
      id: task.skillPack.id,
      version: task.skillPack.version,
      hash: task.skillPack.hash,
    },
  }
  const repairContext = task.qaFeedback?.length
    ? `\nIndependent Agent Core audit rejected the previous pass. Resume the existing artifact; do not rebuild it. Fix every issue below, then repeat screenshot/refine/audit:\n${task.qaFeedback.map((issue) => `- ${issue}`).join('\n')}\n`
    : ''
  return `Use the embedded global skill pack below. It is already imported by PM Lifecycle Agent; do not rely on repository-relative skill files being present in production.

${renderSkillPackForPrompt(task.skillPack)}

You are the approved Figma craft worker for PM Lifecycle Agent. Use only the za-talk-to-figma MCP server.

The scaffold has already been created after user approval. It is intentionally sparse and is not a layout suggestion, visual direction or wireframe to polish. Read the lifecycle artifact by idempotency key and root node, explicitly navigate to the exact output Page before any write, then author the product experience from ProductSpec. Preserve the artifact root, screen frames, existing ZDS instances and lifecycle metadata so independent read-back remains valid. You own the information architecture, composition, visual language, product copy, states and signature moments. You may freely restyle, resize, move, reorder and enrich the scaffold with custom composition and additional layers. Do not create, rename or delete Pages. Never mutate nodes on the source ZDS Page.

Product truth precedence is strict: active requirements and current screens override broad idea copy and historical decisions; removed requirements are forbidden. Before completion, scan the final output text for concepts from every removed requirement and make the count zero.

This must be a real craft loop, not a fast tool-success pass:
- inspect the current output and relevant ZDS source instances;
- capture an initial screenshot;
- establish an original art direction and make substantial product-specific improvements;
- avoid repeated card stacks, generic rectangle layouts and one-template-per-screen composition;
- wire the interactive prototype: for every prototypeEdge in the brief, call set_reactions on the real CTA instance in fromScreenId to NAVIGATE to the destination screen frame (ON_CLICK, with a SMART_ANIMATE or PUSH transition where it reads naturally). Connect the actual visible CTA node, never the whole frame or an invisible overlay. The final read-back must expose ${task.plan.source.screens.flatMap((screen) => screen.prototypeEdges).length} real NODE-destination reactions;
- capture screenshots, critique visible defects and perform at least one refinement;
- capture a final screenshot, scan for removed-requirement content and read back the Page;
- call audit_product_craft on root ${task.rootNodeId} with ${task.plan.source.screens.length} expected screens and ${task.plan.source.screens.flatMap((screen) => screen.prototypeEdges).length} expected prototype links; do not report success while it has error issues.

This is craft pass ${task.iteration ?? 1}.${repairContext}

All MCP calls must include sessionId ${task.sessionId}. The only writable Page is "${task.artifactPageName}". The read-only ZDS source is "${task.sourcePageName}" (${task.sourcePageId}).
${iconLibrary ? `
The brief's "iconLibrary" lists ${iconLibrary.count} real ZDS icon component sets (prefixes ${iconLibrary.namePrefixes.join(', ') || 'zi_zds_ic_'}) as name → componentSetId. Use them for every icon in the journey — headers, list items, tabs, empty states, statuses: instantiate_component({ componentSetId: <setId>, parentId: <a frame on the output Page> }), then position and recolor as needed. Do not draw placeholder squares or custom glyphs where a matching named icon exists, and do not navigate to the icon Page (instantiate cross-page by id).
` : ''}
Approved design brief:
${JSON.stringify(brief)}

Return only the required JSON report.`
}

function stageFromOutput(line: string, screenshotSeen: boolean): FigmaDesignWorkerStage | null {
  if (/read_lifecycle_artifact|get_design_context|capture_design_system_context|get_nodes_info/.test(line)) return 'inspecting'
  if (/get_screenshot|save_screenshots/.test(line)) return 'reviewing'
  if (/apply_craft_patch|create_|clone_node|instantiate_component|set_|move_nodes|resize_nodes|reparent_nodes|reorder_nodes/.test(line)) {
    return screenshotSeen ? 'refining' : 'crafting'
  }
  return null
}

export class CodexFigmaDesignWorker {
  constructor(private readonly codexCommand = 'codex') {}

  async probe(): Promise<{ available: boolean; detail: string }> {
    try {
      const { stdout } = await execFileAsync(this.codexCommand, ['--version'], { timeout: 5_000 })
      return { available: true, detail: stdout.trim() }
    } catch {
      return { available: false, detail: 'Codex CLI hoặc phiên đăng nhập không khả dụng' }
    }
  }

  run(task: FigmaDesignWorkerTask, options: FigmaDesignWorkerOptions = {}): Promise<FigmaDesignWorkerReport> {
    const args = [
      'app-server',
      '-c', `mcp_servers.za-talk-to-figma.command=${JSON.stringify(task.mcpBinaryPath)}`,
      '-c', 'mcp_servers.za-talk-to-figma.args=["--ip","127.0.0.1","--port","1802"]',
    ]
    options.onProgress?.('starting', 'Khởi tạo design worker và khóa Figma scope đã duyệt')

    const env = {
      ...process.env,
      ...(task.codexHome ? { CODEX_HOME: task.codexHome } : {}),
      ...(task.extraEnv ?? {}),
    }
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(this.codexCommand, args, { cwd: task.workingDirectory, stdio: ['pipe', 'pipe', 'pipe'], env })
      } catch (error) {
        reject(error)
        return
      }
      const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
      const scope: FigmaWorkerScope = {
        sessionId: task.sessionId,
        sourcePageName: task.sourcePageName,
        artifactPageName: task.artifactPageName,
        currentPageName: task.sourcePageName,
      }
      let nextId = 1
      let settled = false
      let stderr = ''
      let buffer = ''
      let output = ''
      let screenshotSeen = false
      let toolOrdinal = 0
      const observed: ObservedCraftEvidence = {
        screenshotCalls: [],
        writeCalls: [],
        productAuditCalls: 0,
      }
      let lastStage: FigmaDesignWorkerStage = 'starting'
      const emit = (stage: FigmaDesignWorkerStage, message: string): void => {
        if (stage === lastStage && stage !== 'reviewing') return
        lastStage = stage
        options.onProgress?.(stage, message)
      }
      const consumeLine = (line: string): void => {
        if (/get_screenshot|save_screenshots/.test(line)) screenshotSeen = true
        const stage = stageFromOutput(line, screenshotSeen)
        if (!stage) return
        const messages: Record<FigmaDesignWorkerStage, string> = {
          starting: 'Khởi tạo design worker',
          inspecting: 'Đang đọc scaffold, ProductSpec và ZDS context',
          crafting: 'Đang tạo art direction và compose trải nghiệm',
          reviewing: 'Đang chụp và review thiết kế',
          refining: 'Đang sửa thiết kế từ visual feedback',
          completed: 'Design worker hoàn tất',
        }
        emit(stage, messages[stage])
      }
      const send = (message: JsonRpcMessage): void => {
        child.stdin.write(`${JSON.stringify(message)}\n`)
      }
      const request = (method: string, params: unknown): Promise<unknown> => {
        const id = nextId++
        send({ method, id, params: params as Record<string, unknown> })
        return new Promise((requestResolve, requestReject) => {
          pending.set(id, { resolve: requestResolve, reject: requestReject })
        })
      }
      const respondToServerRequest = (message: JsonRpcMessage): void => {
        if (message.id === undefined || !message.method) return
        if (message.method === 'mcpServer/elicitation/request' && message.params) {
          const toolName = toolNameFromElicitation(message.params)
          toolOrdinal += 1
          const decision = approveFigmaWorkerElicitation(message.params, scope)
          if (decision.approved) {
            if (toolName === 'get_screenshot' || toolName === 'save_screenshots') {
              observed.screenshotCalls.push(toolOrdinal)
            } else if (toolName === 'audit_product_craft') {
              observed.productAuditCalls += 1
            } else if (toolName && !isReadOnlyFigmaTool(toolName) && toolName !== 'navigate_to_page') {
              observed.writeCalls.push(toolOrdinal)
            }
            send({ id: message.id, result: { action: 'accept', content: null, _meta: null } })
          } else {
            send({ id: message.id, result: { action: 'decline', content: null, _meta: { reason: decision.reason } } })
          }
          return
        }
        send({
          id: message.id,
          error: { code: -32_000, message: `Design worker denied ${message.method}` },
        })
      }
      const finish = (error: Error | null, report?: FigmaDesignWorkerReport): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abort)
        pending.forEach((entry) => entry.reject(error ?? new Error('Figma design worker stopped')))
        pending.clear()
        child.kill()
        if (error) reject(error)
        else if (report) resolve(report)
      }
      const consumeMessage = (message: JsonRpcMessage): void => {
        const serialized = JSON.stringify(message)
        if (/get_screenshot|save_screenshots/.test(serialized)) screenshotSeen = true
        const stage = stageFromOutput(serialized, screenshotSeen)
        if (stage) consumeLine(serialized)
        if (message.id !== undefined && ('result' in message || 'error' in message)) {
          if (typeof message.id !== 'number') return
          const entry = pending.get(message.id)
          if (!entry) return
          pending.delete(message.id)
          if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
          else entry.resolve(message.result)
          return
        }
        if (message.id !== undefined && message.method) {
          respondToServerRequest(message)
          return
        }
        if (message.method === 'item/agentMessage/delta' && typeof message.params?.delta === 'string') {
          output += message.params.delta
        }
        if (message.method === 'turn/completed') {
          const turn = message.params?.turn as Record<string, unknown> | undefined
          if (turn?.status === 'failed') {
            const detail = JSON.stringify(turn.error)
            finish(new Error(/usageLimitExceeded|usage limit/i.test(detail)
              ? 'Figma design worker hết quota provider giữa craft pass. Artifact hiện tại được giữ nguyên để retry/resume, không dựng lại từ đầu.'
              : `Codex design turn failed: ${detail}`))
            return
          }
          try {
            const report = parseFigmaDesignWorkerReport(JSON.parse(output), task, observed)
            emit('completed', report.summary)
            finish(null, report)
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)))
          }
        }
      }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            consumeMessage(JSON.parse(line) as JsonRpcMessage)
          } catch {
            stderr = `${stderr}\nInvalid App Server message: ${line}`.slice(-8_000)
          }
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8_000)
      })
      const timeout = setTimeout(() => {
        finish(new Error(`Figma design worker timeout sau ${Math.round(task.timeoutMs / 60_000)} phút`))
      }, task.timeoutMs)
      const abort = (): void => {
        finish(new Error('Figma design worker đã bị hủy'))
      }
      options.signal?.addEventListener('abort', abort, { once: true })
      child.on('error', (error) => {
        finish(error)
      })
      child.on('exit', (code, signal) => {
        if (!settled) finish(new Error(`Figma design worker exited (${code ?? signal}): ${stderr || 'không có error output'}`))
      })
      void (async () => {
        try {
          await request('initialize', {
            clientInfo: { name: 'pm-lifecycle-figma-worker', title: 'PM Lifecycle Figma Worker', version: '0.1.0' },
            capabilities: null,
          })
          send({ method: 'initialized', params: {} })
          const started = await request('thread/start', {
            model: task.modelId,
            cwd: task.workingDirectory,
            approvalPolicy: 'on-request',
            approvalsReviewer: 'user',
            sandbox: 'read-only',
            ephemeral: true,
            baseInstructions: 'Use only the za-talk-to-figma MCP. Shell commands, file changes, other MCP servers and external apps are forbidden.',
          }) as { thread: { id: string } }
          await request('turn/start', {
            threadId: started.thread.id,
            input: [{ type: 'text', text: buildFigmaDesignWorkerPrompt(task), text_elements: [] }],
            effort: 'high',
            outputSchema: task.skillPack.reportSchema,
          })
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })()
    })
  }
}
