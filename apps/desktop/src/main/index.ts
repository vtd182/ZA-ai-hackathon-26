import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import { acceptCompletedProviderEvents, advanceReasoningPhase, approveActions, assertProviderSwitchAllowed, changeIntentFromCanvasCommand, createHandoffPackage, createImpactPreview, customDecisionOptionId, executeConnectorAction, normalizeClarificationAnswers, rejectActions, resolveRemovalChangeIntent, selectDecisionOption, synthesizeProductSpecFromDecision, type ConnectorExecutionResult } from '@pm-agent/agent-core'
import { legacyCommandsToCanvasProgram, planDiagramScene, planExplicitCanvasRequest, resolveCanvasSelection, synthesizeProductSpecFromCanvas } from '@pm-agent/canvas'
import {
  createFigmaArtifactPlan,
  createMockJiraPlan,
  createMockZdocPlan,
  FigmaMcpAdapter,
  FigmaMcpArtifactConnector,
  FigmaRuntimeManager,
  figmaApplyTimeoutMs,
  hashConnectorPayload,
  MockFigmaArtifactConnector,
  MockJiraConnector,
  MockZdocConnector,
  normalizeFigmaDesignSystemContext,
  renderProductSpecMarkdown,
  SqliteMockArtifactStore,
  type ArtifactConnector,
  type PreflightResult,
  type VerificationResult,
} from '@pm-agent/connectors'
import type {
  ChangeIntent,
  ArtifactProgressEvent,
  CanvasGestureCommand,
  CanvasExecutionFailure,
  CanvasExecutionReceipt,
  CanvasDocumentContext,
  CanvasProgram,
  CanvasPromotionPreview,
  ChatMessage,
  ConfigureProviderInput,
  DesktopApi,
  LifecycleWorkspaceState,
  ProviderProfile,
  ProviderEvent,
  ProviderIntent,
  SendChatInput,
  PlannedAction,
  ThreadSummary,
  ProductSpec,
  FigmaCreativeBlueprint,
  FigmaArtifactPlan,
  FigmaArtifactSnapshot,
  FigmaPreflightPlan,
  ActionReceipt,
} from '@pm-agent/domain'
import {
  createDraftProductSpec,
  designSystemManifestSchema,
  figmaArtifactPlanSchema,
  figmaPreflightResultSchema,
  mockJiraPlanSchema,
  mockZdocPlanSchema,
  summarizeFigmaDesignSystemContext,
  transitionRunState,
  type DesignSystemManifest,
  type FigmaSetupStatus,
  type FigmaTargetBinding,
  type RunState,
} from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import { DEMO_FIXTURE_VERSION, DEMO_THREAD_ID, FigmaIntegrationStore, HistoryStore, LifecycleStore, OutboxStore } from '@pm-agent/persistence'
import { createScaffoldFigmaBlueprint, ProviderRegistry } from '@pm-agent/reasoning'
import { SecretStore } from './secret-store'
import { CanvasBridge } from './canvas-bridge'
import { runCanvasScriptVm } from './canvas-script-vm'
import { assertProviderTurnAvailable } from './active-turns'
import { parseSlashCommand, slashHelpMessage } from './slash-commands'
import { mapFreeformDiscoveryAnswers } from './workflow-intent'
import { isManagedFigmaArtifactPage, missingFigmaRoles } from './figma-source-policy'
import { CodexFigmaDesignWorker, type FigmaDesignWorkerStage, type FigmaDesignWorkerTask } from './figma-design-worker'
import { loadFigmaCraftSkillPack } from './skill-packs'
import { CANVAS_SKILL_ID, CANVAS_SKILL_VERSION, installCanvasSkill } from './skill-installer'

const { app, BrowserWindow, ipcMain, shell } = electron
if (process.env.PM_AGENT_REMOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.PM_AGENT_REMOTE_DEBUG_PORT)
}

let mainWindow: BrowserWindowType | null = null
let history: HistoryStore
let lifecycle: LifecycleStore
let figmaRuntime: FigmaRuntimeManager
let figmaMcp: FigmaMcpAdapter
let figmaIntegration: FigmaIntegrationStore
let outbox: OutboxStore
let mockFigmaStore: SqliteMockArtifactStore
let mockJira: MockJiraConnector
let mockZdoc: MockZdocConnector
let secrets: SecretStore
let canvasBridge: CanvasBridge
let canvasSkillInstall: ReturnType<typeof installCanvasSkill> | null = null
const providers = new ProviderRegistry()
const figmaDesignWorker = new CodexFigmaDesignWorker()
const activeRuns = new Map<string, AbortController>()
const promotionPreviews = new Map<string, CanvasPromotionPreview>()
const pendingCanvasExecutions = new Map<string, {
  threadId: string
  program: CanvasProgram
  kind: 'draw' | 'edit'
}>()

function assertNoActiveProviderTurn(threadId: string): void {
  assertProviderTurnAvailable(activeRuns.keys(), threadId)
}

if (process.env.PM_AGENT_USER_DATA) app.setPath('userData', process.env.PM_AGENT_USER_DATA)

const providerEnv: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}
const moduleDirectory = dirname(fileURLToPath(import.meta.url))

function timestamp(): string {
  return new Date().toISOString()
}

function resequenceProviderEvents(...groups: ProviderEvent[][]): ProviderEvent[] {
  return groups.flat().map((event, sequence) => ({ ...event, sequence }))
}

function deliveryStatusMessage(productSpec: ProductSpec, selectedOption?: string): string {
  const requirements = productSpec.requirements.filter((item) => item.status !== 'removed').length
  const prefix = selectedOption ? `Đã khóa phương án “${selectedOption}”. ` : ''
  return `${prefix}Mình đã tự tổng hợp ProductSpec v${productSpec.version} từ chính cuộc hội thoại: ${requirements} requirement, ${productSpec.screens.length} screen, ${productSpec.stories.length} story.\n\nĐề xuất của mình cho bước tiếp: (1) vẽ user flow ngay để bạn review — gõ “vẽ user flow” hoặc bấm **User flow**; (2) sau đó mình chuẩn bị kickoff package (Figma + PRD.md + backlog mock) và chờ bạn duyệt. Bạn muốn bắt đầu từ đâu?`
}

function canvasReceiptMessage(program: CanvasProgram, receipt: CanvasExecutionReceipt, kind: 'draw' | 'edit'): string {
  const nodeOperations = program.operations.filter(
    (operation): operation is Extract<CanvasProgram['operations'][number], { op: 'create_node' }> =>
      operation.op === 'create_node'
  )
  const nodes = nodeOperations.length
  const connections = program.operations.filter((operation) => operation.op === 'connect').length
  const decisions = nodeOperations.filter((operation) => operation.kind === 'decision').length
  const updates = program.operations.filter((operation) => operation.op === 'update' || operation.op === 'delete').length
  if (program.mode === 'script') {
    return `Canvas đã thực thi ${receipt.appliedOperationCount} thao tác và đọc lại ${receipt.shapeCount} phần tử.`
  }
  if (kind === 'edit') {
    const detail = [
      nodes > 0 ? `thêm ${nodes} node` : '',
      connections > 0 ? `${connections} kết nối` : '',
      updates > 0 ? `${updates} chỉnh sửa` : '',
    ].filter(Boolean).join(', ')
    return `Đã cập nhật vùng canvas đã chọn${detail ? `: ${detail}` : ''}. Đọc lại thành công ${receipt.shapeCount} phần tử.`
  }
  if (program.sceneType === 'prototype' || /prototype/i.test(program.summary)) {
    const journey = nodeOperations.map((operation) => operation.label).join(' → ')
    return `Đã dựng ${nodes} màn hình có nội dung và trạng thái riêng: ${journey}. Chọn một màn hình hoặc thành phần trên canvas, rồi nói điều bạn muốn sửa; agent sẽ chỉ cập nhật vùng đó.`
  }
  const mainPath = nodeOperations.slice(0, 6).map((operation) => operation.label).join(' → ')
  const remaining = Math.max(0, nodes - 6)
  return `Đã dựng flow ${nodes} bước${decisions > 0 ? ` với ${decisions} điểm quyết định` : ''}. Luồng chính: ${mainPath}${remaining > 0 ? ` → và ${remaining} bước/nhánh tiếp theo` : ''}. Chọn một node hoặc khoanh vùng cần feedback để mình sửa đúng phần đó.`
}

function figmaRuntimePaths(): { binaryPath: string; manifestPath: string } {
  if (app.isPackaged) {
    const root = join(process.resourcesPath, 'figma-runtime')
    return { binaryPath: join(root, 'za-talk-to-figma'), manifestPath: join(root, 'plugin', 'manifest.json') }
  }
  const candidates = [
    process.env.PM_AGENT_REPO_ROOT,
    process.cwd(),
    resolve(app.getAppPath(), '../..'),
    resolve(moduleDirectory, '../../../..'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  const root = candidates.find((candidate) => existsSync(join(candidate, 'mcp-tool', 'za-talk-to-figma', 'plugin', 'manifest.json')))
    ?? candidates[0]!
  const runtimeRoot = join(root, 'mcp-tool', 'za-talk-to-figma')
  return {
    binaryPath: join(runtimeRoot, 'bin', 'za-talk-to-figma'),
    manifestPath: join(runtimeRoot, 'plugin', 'manifest.json'),
  }
}

function developmentRepositoryRoot(): string {
  if (app.isPackaged) return resolve(app.getAppPath(), '..')
  const candidates = [
    process.env.PM_AGENT_REPO_ROOT,
    process.cwd(),
    resolve(app.getAppPath(), '../..'),
    resolve(moduleDirectory, '../../../..'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(join(candidate, 'skills', 'pm-lifecycle-figma-design', 'SKILL.md')))
    ?? candidates[0]!
}

function skillPackRuntimeRoots(): Parameters<typeof loadFigmaCraftSkillPack>[0] {
  return {
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repositoryRoot: developmentRepositoryRoot(),
  }
}

function figmaWorkerDirectory(): string {
  return app.isPackaged ? app.getPath('userData') : developmentRepositoryRoot()
}

function workspaceFor(threadId: string): LifecycleWorkspaceState {
  let runState = lifecycle.getRunState(threadId)
  if (!runState) {
    const createdAt = timestamp()
    runState = lifecycle.initializeRun(
      threadId,
      `run:${threadId}`,
      threadId === DEMO_THREAD_ID ? mealOrderingProductSpec : createDraftProductSpec(threadId, createdAt),
      createdAt,
      threadId === DEMO_THREAD_ID ? 'DELIVERY' : 'IDEA_INTAKE',
    )
  }
  const preview = runState.status === 'WAITING_FOR_APPROVAL' && runState.pendingIntent
    ? createImpactPreview(runState.productSpec, runState.pendingIntent, runState.id, runState.lastCheckpointAt)
    : null
  const execution = outbox.listRun(runState.id).length > 0 ? outbox.summary(runState.id) : null
  const latestReasoning = lifecycle.getLatestReasoningCheckpoint(runState.id)?.result ?? null
  const reasoning = latestReasoning?.phase === 'discover'
    && runState.phase === 'DISCOVERY'
    && runState.status === 'ACTIVE'
    ? latestReasoning
    : latestReasoning?.phase === 'decide'
      && runState.phase === 'DECISION'
      && runState.status === 'WAITING_FOR_DECISION'
      ? latestReasoning
      : null
  return { runState, preview, execution, reasoning }
}

function threadForRenderer<T extends ThreadSummary>(thread: T): T {
  const runState = lifecycle.getRunState(thread.id)
  const collaborationMode = runState?.phase === 'IDEA_INTAKE'
    || (!runState && thread.id !== DEMO_THREAD_ID)
    ? 'studio'
    : 'lifecycle'
  const phase = runState
    ? runState.phase === 'DECISION'
      ? 'decide'
      : runState.phase === 'DELIVERY'
        ? 'deliver'
        : runState.phase === 'CHANGE_IMPACT'
          ? 'change'
          : 'discover'
    : thread.phase
  return { ...thread, phase, collaborationMode }
}

function moveToDeliveryForChange(state: RunState, at: string): RunState {
  let next = state
  if (next.phase === 'IDEA_INTAKE' && next.status === 'ACTIVE') next = transitionRunState(next, 'START_DISCOVERY', at)
  if (next.phase === 'DISCOVERY' && next.status === 'ACTIVE') next = transitionRunState(next, 'REQUEST_DECISION', at)
  if (next.phase === 'DECISION' && next.status === 'WAITING_FOR_DECISION') next = transitionRunState(next, 'SELECT_OPTION', at)
  return next
}

function stageChangePreview(threadId: string, intent: ChangeIntent, at: string): { workspace: LifecycleWorkspaceState; created: boolean } {
  const workspace = workspaceFor(threadId)
  if (workspace.preview) {
    if (workspace.preview.intent.operation === intent.operation && workspace.preview.intent.targetEntityId === intent.targetEntityId) {
      return { workspace, created: false }
    }
    throw new Error('Một change plan khác đang chờ quyết định')
  }
  let impactState = moveToDeliveryForChange(workspace.runState, at)
  if (impactState.phase === 'CHANGE_IMPACT' && impactState.status === 'NEEDS_USER_INPUT') {
    impactState = transitionRunState(impactState, 'PROVIDE_INPUT', at)
  } else {
    impactState = transitionRunState(impactState, 'REQUEST_CHANGE', at)
  }
  const preview = createImpactPreview(impactState.productSpec, intent, impactState.id, at)
  const nextState = transitionRunState({
    ...impactState,
    pendingIntent: intent,
    pendingActions: preview.actions,
    pendingClarification: null,
  }, 'PREVIEW_READY', at)
  lifecycle.savePreview(nextState)
  history.setThreadPhase(threadId, 'change')
  return { workspace: workspaceFor(threadId), created: true }
}

function stageChangeAmbiguity(threadId: string, ambiguity: string, at: string): LifecycleWorkspaceState {
  let state = moveToDeliveryForChange(workspaceFor(threadId).runState, at)
  if (state.phase === 'DELIVERY' && state.status === 'ACTIVE') state = transitionRunState(state, 'REQUEST_CHANGE', at)
  if (state.phase === 'CHANGE_IMPACT' && state.status === 'ACTIVE') state = transitionRunState(state, 'NEEDS_INPUT', at)
  if (state.phase !== 'CHANGE_IMPACT' || state.status !== 'NEEDS_USER_INPUT') {
    throw new Error(`Không thể yêu cầu clarification từ ${state.phase}/${state.status}`)
  }
  lifecycle.saveRunState({
    ...state,
    pendingIntent: null,
    pendingActions: [],
    pendingClarification: ambiguity,
    lastCheckpointAt: at,
  })
  history.setThreadPhase(threadId, 'change')
  return workspaceFor(threadId)
}

function resetDemoWorkspace(): { fixtureVersion: 1; thread: ReturnType<HistoryStore['resetDemoWorkspace']>; workspace: LifecycleWorkspaceState } {
  for (const controller of activeRuns.values()) controller.abort()
  activeRuns.clear()
  mockFigmaStore.reset()
  const thread = history.resetDemoWorkspace()
  return { fixtureVersion: DEMO_FIXTURE_VERSION, thread, workspace: workspaceFor(thread.id) }
}

interface FigmaExecutionContext {
  target: FigmaTargetBinding
  manifest: DesignSystemManifest
  connectorMode: 'live' | 'mock'
  planMode: import('@pm-agent/domain').ArtifactPlanMode
}

function figmaExecutionContext(): FigmaExecutionContext {
  const target = figmaIntegration.getActiveTarget()
  const context = target ? figmaIntegration.getContext(target.targetHash) : null
  if (target && context) {
    // A configured ZDS ref that captured live → reference mode: prefer its components and
    // icons, creatively fill anything it lacks, and never block the flow.
    if (context.mode === 'live') {
      return { target, manifest: context.manifest, connectorMode: 'live', planMode: 'reference' }
    }
    // Ref configured but the live capture failed → degrade to free creative on the live
    // target instead of blocking. The design is still produced (labeled as free).
    return { target, manifest: context.manifest, connectorMode: 'live', planMode: 'free' }
  }
  // No ref configured → free creative composition offline against the synthetic palette.
  return {
    target: {
      schemaVersion: 1,
      targetHash: 'f'.repeat(64),
      sessionId: 'mock:figma:offline',
      fileName: 'Mock Figma sandbox',
      pageId: '0:1',
      pageName: 'PM Lifecycle Demo',
      allowedAt: mealOrderingProductSpec.createdAt,
    },
    manifest: syntheticZaloDesignSystem,
    connectorMode: 'mock',
    planMode: 'free',
  }
}

// Honest human label combining where it writes (live/mock) and how it composes (reference
// ZDS / free creative / strict ZDS).
function figmaModeLabel(action: PlannedAction | undefined): string {
  const connector = action?.payload.connectorMode === 'live' ? 'Figma live' : 'Mock Figma'
  const guard = action?.payload.guardMode
  const composition = guard === 'reference' ? 'reference ZDS'
    : guard === 'free' ? 'free creative'
    : guard === 'strict' ? 'strict ZDS'
    : ''
  return composition ? `${connector} · ${composition}` : connector
}

function assertFigmaRoleCoverage(spec: ProductSpec, context: FigmaExecutionContext): void {
  // Only the opt-in strict mode hard-blocks on missing roles. reference/free degrade to a
  // labeled creative fallback so the flow never breaks when the ref lacks a component.
  if (context.planMode !== 'strict' || context.connectorMode !== 'live') return
  const missingRoles = missingFigmaRoles(spec, context.manifest)
  if (missingRoles.length === 0) return
  throw new Error(
    `Figma Design System source "${context.manifest.sourceLabel}" thiếu semantic roles: ${missingRoles.join(', ')}. `
    + 'Page đang allow có thể là artifact output thay vì thư viện ZDS. '
    + 'Mở Page chứa ZDS trong [PUBLIC] Zalo Mini App Framework 2.0 - dup, sau đó mở Figma setup và chọn "Dùng Page đang mở làm nguồn ZDS".',
  )
}

function artifactActionsFor(state: RunState, spec: ProductSpec): PlannedAction[] {
  const entityIds = [
    ...spec.requirements.map((entity) => entity.id),
    ...spec.screens.map((entity) => entity.id),
    ...spec.stories.map((entity) => entity.id),
  ]
  if (entityIds.length === 0) throw new Error('ProductSpec chưa có scope để tạo artifact')
  return (['figma', 'jira', 'zdoc'] as const).map((target) => ({
    schemaVersion: 1,
    id: `action:${state.id}:spec:v${spec.version}:${target}`,
    runId: state.id,
    target,
    operation: 'create',
    entityIds,
    payload: {},
    payloadHash: 'pending-preflight',
    status: 'pending_approval',
  }))
}

function markdownArtifactPath(spec: ProductSpec): string {
  const slug = spec.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'product-spec'
  return join(app.getPath('userData'), 'exports', `${slug}-v${spec.version}.md`)
}

function exportMarkdownArtifact(spec: ProductSpec): string {
  const path = markdownArtifactPath(spec)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, renderProductSpecMarkdown(spec), 'utf8')
  return path
}

function exportThreadBundle(threadId: string): import('@pm-agent/domain').ThreadExportResult {
  const thread = history.getThread(threadId)
  const workspace = workspaceFor(threadId)
  const messages = history.allMessages(threadId)
  const exportedAt = timestamp()
  const slug = thread.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'thread'
  const directoryPath = join(
    app.getPath('userData'),
    'exports',
    `${slug}-${exportedAt.replace(/[:.]/g, '-')}`,
  )
  mkdirSync(directoryPath, { recursive: true })

  const transcript = [
    `# ${thread.title}`,
    '',
    `- Thread: ${thread.id}`,
    `- Provider: ${thread.providerId} / ${thread.modelId}`,
    `- Phase: ${thread.phase}`,
    `- Exported: ${exportedAt}`,
    '',
    '## Transcript',
    '',
    ...messages.flatMap((message) => [
      `### ${message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Agent' : 'System'} · ${message.createdAt}`,
      '',
      message.content,
      '',
    ]),
  ].join('\n')
  const files = [
    'README.md',
    'chat.md',
    'product-spec.md',
    'productspec.json',
    'canvas.json',
    'workspace.json',
    'review-bundle.json',
  ]
  writeFileSync(join(directoryPath, 'README.md'), [
    '# PM Lifecycle review bundle',
    '',
    'Bundle này chứa transcript, ProductSpec, canvas snapshot và trạng thái workflow tại thời điểm export.',
    'Có thể gửi toàn bộ thư mục này để tái hiện và kiểm chứng hành vi.',
    '',
    ...files.slice(1).map((file) => `- ${file}`),
  ].join('\n'), 'utf8')
  writeFileSync(join(directoryPath, 'chat.md'), transcript, 'utf8')
  writeFileSync(join(directoryPath, 'product-spec.md'), renderProductSpecMarkdown(workspace.runState.productSpec), 'utf8')
  writeFileSync(join(directoryPath, 'productspec.json'), JSON.stringify(workspace.runState.productSpec, null, 2), 'utf8')
  writeFileSync(join(directoryPath, 'canvas.json'), JSON.stringify(thread.canvasSnapshot, null, 2), 'utf8')
  const workspaceExport = {
    exportedAt,
    thread: {
      id: thread.id,
      title: thread.title,
      phase: thread.phase,
      status: thread.status,
      providerId: thread.providerId,
      modelId: thread.modelId,
    },
    runState: workspace.runState,
    preview: workspace.preview,
    execution: workspace.execution,
    reasoning: workspace.reasoning,
  }
  writeFileSync(join(directoryPath, 'workspace.json'), JSON.stringify(workspaceExport, null, 2), 'utf8')
  writeFileSync(join(directoryPath, 'review-bundle.json'), JSON.stringify({
    schemaVersion: 1,
    ...workspaceExport,
    messages,
    productSpec: workspace.runState.productSpec,
    canvasSnapshot: thread.canvasSnapshot,
  }, null, 2), 'utf8')
  shell.showItemInFolder(join(directoryPath, 'review-bundle.json'))
  return { directoryPath, files, exportedAt }
}

function emitArtifactProgress(
  threadId: string,
  event: Omit<ArtifactProgressEvent, 'schemaVersion' | 'threadId' | 'at'>,
): void {
  mainWindow?.webContents.send('artifact:progress', {
    schemaVersion: 1,
    threadId,
    ...event,
    at: timestamp(),
  } satisfies ArtifactProgressEvent)
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 0 : 1)}s`
}

function timingSummary(results: ConnectorExecutionResult[]): string {
  const figma = results.find((result) => result.target === 'figma')
  if (!figma) return ''
  return ` Figma ${seconds(figma.timings.total)} (write ${seconds(figma.timings.write)}, read-back ${seconds(figma.timings.read_back)}).`
}

async function createCreativeFigmaBlueprint(
  state: RunState,
  spec: ProductSpec,
  manifest: DesignSystemManifest,
  feedback?: string,
): Promise<FigmaCreativeBlueprint> {
  const thread = history.getThread(state.threadId)
  const profile = history.getProfile(thread.providerId)
  const provider = providers.get(profile.providerId)
  if (!activeRuns.has(state.threadId)) assertNoActiveProviderTurn(state.threadId)
  const ownedController = activeRuns.has(state.threadId) ? null : new AbortController()
  const controller = activeRuns.get(state.threadId) ?? ownedController!
  if (ownedController) activeRuns.set(state.threadId, ownedController)
  const timeout = setTimeout(() => ownedController?.abort(), 10 * 60_000)
  try {
    const apiKey = secrets.get(profile.id)
    const response = await provider.reason({
      threadId: state.threadId,
      phase: 'deliver',
      message: feedback
        ? `Hãy sửa Creative Figma Blueprint theo lỗi preflight sau rồi trả lại toàn bộ blueprint: ${feedback}`
        : 'Thiết kế một kickoff Figma gần sản phẩm thật từ ProductSpec. Dùng ZDS cho controls nhưng tự do sáng tạo composition và visual language.',
      recentMessages: history.recentMessages(state.threadId),
      responseMode: 'figma',
      intentHint: { kind: 'artifact', target: null, artifactAction: 'prepare' },
      productSpec: spec,
      figmaComponentRoles: [...new Set(manifest.components
        .filter((component) => !component.deprecated)
        .map((component) => component.semanticRole))],
      remoteRef: null,
    }, {
      modelId: profile.modelId,
      ...(apiKey ? { apiKey } : {}),
    }, controller.signal)
    const blueprint = response.result.figmaBlueprint
    if (!blueprint) throw new Error('Provider hoàn tất nhưng không trả Creative Figma Blueprint')
    return blueprint
  } finally {
    clearTimeout(timeout)
    if (ownedController) activeRuns.delete(state.threadId)
  }
}

async function prepareExecutableActions(
  state: RunState,
  spec: ProductSpec,
  refineNote?: string,
  revisionLabel?: string,
): Promise<PlannedAction[]> {
  const planningStartedAt = Date.now()
  emitArtifactProgress(state.threadId, {
    target: 'figma',
    stage: 'planning',
    status: 'running',
    stageElapsedMs: 0,
    totalElapsedMs: 0,
    message: 'Đang tạo và kiểm tra immutable Figma plan',
  })
  const figmaAction = state.pendingActions.find((action) => action.target === 'figma')
  const jiraAction = state.pendingActions.find((action) => action.target === 'jira')
  const zdocAction = state.pendingActions.find((action) => action.target === 'zdoc')
  if (!figmaAction || !jiraAction || !zdocAction) throw new Error('Change plan must contain Figma, Jira and Zdoc actions')
  const figmaContext = figmaExecutionContext()
  assertFigmaRoleCoverage(spec, figmaContext)
  const workerProbe = figmaContext.connectorMode === 'live' && process.env.PM_AGENT_FIGMA_DESIGN_WORKER !== 'blueprint'
    ? await figmaDesignWorker.probe()
    : { available: false, detail: 'Blueprint compositor được cấu hình' }
  const useAgenticWorker = figmaContext.connectorMode === 'live' && workerProbe.available
  const thread = history.getThread(state.threadId)
  const threadProfile = history.getProfile(thread.providerId)
  const designWorkerModelId = process.env.PM_AGENT_FIGMA_DESIGN_MODEL
    ?? (threadProfile.providerId === 'codex' ? threadProfile.modelId : 'gpt-5.5')
  emitArtifactProgress(state.threadId, {
    target: 'figma',
    stage: 'planning',
    status: 'running',
    stageElapsedMs: Date.now() - planningStartedAt,
    totalElapsedMs: Date.now() - planningStartedAt,
    message: useAgenticWorker
      ? `Đang chuẩn bị guarded scaffold; craft worker ${workerProbe.detail} sẽ thiết kế sau approval`
      : 'Design agent đang tạo art direction, screen composition và ZDS placements',
  })
  let creativeBlueprint: FigmaCreativeBlueprint
  const metadataBase = {
    runId: state.id,
    threadId: state.threadId,
    actionId: figmaAction.id,
    pageStrategy: 'create_or_reuse_managed' as const,
  }
  let figmaPlan: ReturnType<typeof createFigmaArtifactPlan>
  try {
    creativeBlueprint = useAgenticWorker
      ? createScaffoldFigmaBlueprint(
          spec,
          [...new Set(figmaContext.manifest.components
            .filter((component) => !component.deprecated)
            .map((component) => component.semanticRole))],
          { sparse: true },
        )
      : await createCreativeFigmaBlueprint(state, spec, figmaContext.manifest, refineNote)
    const metadata = {
      ...metadataBase,
      idempotencyKey: `figma:${state.id}:spec-v${spec.version}${revisionLabel ? `:${revisionLabel}` : ''}:${useAgenticWorker ? 'craft' : 'creative'}-${hashConnectorPayload(creativeBlueprint as unknown as Record<string, unknown>).slice(0, 16)}:${figmaContext.target.targetHash.slice(0, 12)}`,
    }
    try {
      figmaPlan = createFigmaArtifactPlan(
        spec,
        figmaContext.target,
        figmaContext.manifest,
        metadata,
        figmaContext.planMode,
        creativeBlueprint,
      )
    } catch (error) {
      if (useAgenticWorker) throw error
      const feedback = error instanceof Error ? error.message : 'Creative blueprint failed preflight'
      emitArtifactProgress(state.threadId, {
        target: 'figma',
        stage: 'planning',
        status: 'running',
        stageElapsedMs: Date.now() - planningStartedAt,
        totalElapsedMs: Date.now() - planningStartedAt,
        message: `Design agent đang refine blueprint: ${feedback}`,
      })
      creativeBlueprint = await createCreativeFigmaBlueprint(state, spec, figmaContext.manifest, feedback)
      const refinedMetadata = {
        ...metadataBase,
        idempotencyKey: `figma:${state.id}:spec-v${spec.version}:creative-${hashConnectorPayload(creativeBlueprint as unknown as Record<string, unknown>).slice(0, 16)}`,
      }
      figmaPlan = createFigmaArtifactPlan(
        spec,
        figmaContext.target,
        figmaContext.manifest,
        refinedMetadata,
        figmaContext.planMode,
        creativeBlueprint,
      )
    }
  } catch (error) {
    const elapsed = Date.now() - planningStartedAt
    emitArtifactProgress(state.threadId, {
      target: 'figma',
      stage: 'planning',
      status: 'failed',
      stageElapsedMs: elapsed,
      totalElapsedMs: elapsed,
      message: error instanceof Error ? error.message : 'Creative Figma planning thất bại',
    })
    throw error
  }
  const figmaConnector = figmaContext.connectorMode === 'live'
    ? new FigmaMcpArtifactConnector(figmaMcp, figmaContext.manifest, figmaContext.target)
    : new MockFigmaArtifactConnector(figmaContext.manifest, figmaContext.target, { store: mockFigmaStore })
  let figmaPreflight
  let jiraPreflight
  let zdocPreflight
  try {
    [figmaPreflight, jiraPreflight, zdocPreflight] = await Promise.all([
      figmaConnector.preflight(figmaPlan),
      mockJira.preflight(createMockJiraPlan(spec, {
        runId: state.id, threadId: state.threadId, actionId: jiraAction.id, idempotencyKey: `jira:${state.id}:v${spec.version}`,
      })),
      mockZdoc.preflight(createMockZdocPlan(spec, {
        runId: state.id, threadId: state.threadId, actionId: zdocAction.id, idempotencyKey: `zdoc:${state.id}:v${spec.version}`,
      })),
    ])
    const elapsed = Date.now() - planningStartedAt
    emitArtifactProgress(state.threadId, {
      target: 'figma',
      stage: 'planning',
      status: 'completed',
      stageElapsedMs: elapsed,
      totalElapsedMs: elapsed,
      message: useAgenticWorker
        ? `Guarded scaffold sẵn sàng: ${creativeBlueprint.screens.length} màn hình; craft + screenshot/refine sẽ chạy sau approval`
        : `Creative plan sẵn sàng: ${creativeBlueprint.screens.length} màn hình, ${creativeBlueprint.screens.reduce((sum, screen) => sum + screen.elements.length, 0)} lớp (${figmaContext.connectorMode})`,
    })
  } catch (error) {
    const elapsed = Date.now() - planningStartedAt
    emitArtifactProgress(state.threadId, {
      target: 'figma',
      stage: 'planning',
      status: 'failed',
      stageElapsedMs: elapsed,
      totalElapsedMs: elapsed,
      message: error instanceof Error ? error.message : 'Figma preflight thất bại',
    })
    throw error
  }
  if (!figmaPreflight.allowed || !jiraPreflight.allowed || !zdocPreflight.allowed) {
    const blockingIssues = [
      ...figmaPreflight.issues.map((issue) => `Figma ${issue.code}: ${issue.message}`),
      ...jiraPreflight.issues.map((issue) => `Jira ${issue.code}: ${issue.message}`),
      ...zdocPreflight.issues.map((issue) => `Zdoc ${issue.code}: ${issue.message}`),
    ].filter(Boolean)
    throw new Error(`Artifact preflight contains blocking issues: ${blockingIssues.join('; ') || 'unknown issue'}`)
  }
  const scaffoldTimeoutBudgetMs = figmaApplyTimeoutMs(figmaPreflight.plan.estimatedOperations)
  const craftTimeoutBudgetMs = 30 * 60_000

  const executable = <T extends Record<string, unknown>>(
    base: PlannedAction,
    type: string,
    planHash: string,
    plan: T,
    extra: Record<string, unknown> = {},
  ): PlannedAction => {
    const payload = { schemaVersion: 1, type, planHash, plan, ...extra }
    return { ...base, payload, payloadHash: hashConnectorPayload(payload), status: 'pending_approval' }
  }
  return [
    executable(figmaAction, 'figma_design_system_plan', figmaPreflight.planHash, figmaPlan, {
      connectorMode: figmaContext.connectorMode,
      guardMode: figmaContext.planMode,
      manifest: figmaContext.manifest,
      preflight: figmaPreflight,
      estimatedOperations: figmaPreflight.plan.estimatedOperations,
      timeoutBudgetMs: useAgenticWorker
        ? scaffoldTimeoutBudgetMs + craftTimeoutBudgetMs
        : scaffoldTimeoutBudgetMs,
      designWorker: useAgenticWorker ? {
        mode: 'codex_mcp',
        modelId: designWorkerModelId,
        skill: 'pm-lifecycle-figma-design',
        maxReviewPasses: 3,
        timeoutBudgetMs: craftTimeoutBudgetMs,
        ...(refineNote ? { refinementNote: refineNote } : {}),
        productTruth: {
          idea: {
            id: spec.idea.id,
            title: spec.idea.title,
            summary: spec.idea.summary,
            targetUsers: spec.idea.targetUsers,
          },
          activeRequirements: spec.requirements
            .filter((requirement) => requirement.status !== 'removed')
            .map((requirement) => ({
              id: requirement.id,
              title: requirement.title,
              description: requirement.description,
              acceptanceCriteria: requirement.acceptanceCriteria,
            })),
          removedRequirements: spec.requirements
            .filter((requirement) => requirement.status === 'removed')
            .map((requirement) => ({
              id: requirement.id,
              title: requirement.title,
              description: requirement.description,
            })),
          decisions: spec.decisions.map((decision) => ({
            id: decision.id,
            question: decision.question,
            choice: decision.choice,
            rationale: decision.rationale,
            status: decision.status,
          })),
        },
      } : {
        mode: 'blueprint',
      },
    }),
    executable(jiraAction, 'mock_jira_plan', jiraPreflight.planHash, jiraPreflight.plan),
    executable(zdocAction, 'mock_zdoc_plan', zdocPreflight.planHash, zdocPreflight.plan),
  ]
}

function designWorkerMessage(stage: FigmaDesignWorkerStage, message: string): string {
  const labels: Record<FigmaDesignWorkerStage, string> = {
    starting: 'Khởi tạo craft session',
    inspecting: 'Đọc ProductSpec, scaffold và ZDS',
    crafting: 'Compose trải nghiệm sản phẩm',
    reviewing: 'Chụp và review thiết kế',
    refining: 'Refine từ visual feedback',
    completed: 'Visual QA hoàn tất',
  }
  return `${labels[stage]}: ${message}`
}

function withFigmaDesignWorker(
  base: FigmaMcpArtifactConnector,
  threadId: string,
  manifest: DesignSystemManifest,
  workerConfig: Record<string, unknown>,
): ArtifactConnector<FigmaArtifactPlan, FigmaPreflightPlan, FigmaArtifactSnapshot> {
  return {
    target: 'figma',
    checkAvailability: () => base.checkAvailability(),
    preflight: (plan) => base.preflight(plan),
    execute: async (action: PlannedAction, preflight: PreflightResult<FigmaPreflightPlan>): Promise<ActionReceipt> => {
      const receipt = await base.execute(action, preflight)
      const artifactPageName = preflight.plan.source.metadata.artifactPageName
      if (!artifactPageName) throw new Error('Approved design task has no dedicated artifact Page')
      const modelId = typeof workerConfig.modelId === 'string' ? workerConfig.modelId : 'gpt-5.5'
      const timeoutMs = typeof workerConfig.timeoutBudgetMs === 'number'
        ? workerConfig.timeoutBudgetMs
        : 30 * 60_000
      const productTruth = workerConfig.productTruth
      if (!productTruth || typeof productTruth !== 'object' || Array.isArray(productTruth)) {
        throw new Error('Approved design task has no immutable ProductSpec truth')
      }
      const typedProductTruth = productTruth as FigmaDesignWorkerTask['productTruth']
      const maxReviewPasses = Math.max(1, Math.min(3, typeof workerConfig.maxReviewPasses === 'number'
        ? Math.floor(workerConfig.maxReviewPasses)
        : 2))
      const workerStartedAt = Date.now()
      const workerDeadline = workerStartedAt + timeoutMs
      let stageStartedAt = workerStartedAt
      let currentStage: FigmaDesignWorkerStage = 'starting'
      // Seed the first craft pass with the user's refine feedback (if this is a /figma refine).
      let qaFeedback: string[] | undefined = typeof workerConfig.refinementNote === 'string' && workerConfig.refinementNote.trim()
        ? [`Yêu cầu chỉnh sửa của người dùng: ${workerConfig.refinementNote.trim()}`]
        : undefined
      const expectedPrototypeLinks = preflight.plan.source.screens
        .reduce((count, screen) => count + screen.prototypeEdges.length, 0)
      const forbiddenTerms = typedProductTruth.removedRequirements.flatMap((requirement) => [
        requirement.title,
        requirement.description,
      ]).filter((term) => term.trim().length >= 3)

      for (let iteration = 1; iteration <= maxReviewPasses; iteration += 1) {
        const remainingMs = workerDeadline - Date.now()
        if (remainingMs < 60_000) throw new Error('Figma craft budget đã hết trước independent QA repair pass')
        await figmaDesignWorker.run({
          modelId,
          workingDirectory: figmaWorkerDirectory(),
          mcpBinaryPath: figmaRuntimePaths().binaryPath,
          skillPack: loadFigmaCraftSkillPack(skillPackRuntimeRoots()),
          sessionId: preflight.plan.source.target.sessionId,
          sourcePageId: preflight.plan.source.target.pageId,
          sourcePageName: preflight.plan.source.target.pageName,
          artifactPageName,
          rootNodeId: receipt.externalId,
          idempotencyKey: receipt.idempotencyKey,
          plan: preflight.plan,
          manifest,
          productTruth: typedProductTruth,
          iteration,
          ...(qaFeedback ? { qaFeedback } : {}),
          timeoutMs: remainingMs,
        }, {
          ...(activeRuns.get(threadId)?.signal ? { signal: activeRuns.get(threadId)!.signal } : {}),
          onProgress: (stage, message) => {
            const now = Date.now()
            if (stage !== currentStage) {
              currentStage = stage
              stageStartedAt = now
            }
            emitArtifactProgress(threadId, {
              target: 'figma',
              stage: 'write',
              status: 'running',
              stageElapsedMs: now - stageStartedAt,
              totalElapsedMs: now - workerStartedAt,
              message: `${designWorkerMessage(stage, message)} · pass ${iteration}/${maxReviewPasses}`,
            })
          },
        })

        const audit = await figmaMcp.auditProductCraft({
          target: preflight.plan.source.target,
          rootNodeId: receipt.externalId,
          expectedScreenCount: preflight.plan.source.screens.length,
          expectedPrototypeLinks,
          forbiddenTerms,
        })
        if (audit.passed) {
          const now = Date.now()
          emitArtifactProgress(threadId, {
            target: 'figma',
            stage: 'write',
            status: 'completed',
            stageElapsedMs: now - stageStartedAt,
            totalElapsedMs: now - workerStartedAt,
            message: `Independent craft QA pass: ${audit.metrics.screenCount} màn hình, ${audit.metrics.zdsInstanceCount} ZDS instance, ${audit.metrics.prototypeLinkCount} prototype link`,
          })
          return receipt
        }
        qaFeedback = audit.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => `${issue.code} tại ${issue.nodeId}: ${issue.message}`)
        const now = Date.now()
        emitArtifactProgress(threadId, {
          target: 'figma',
          stage: 'write',
          status: 'running',
          stageElapsedMs: now - stageStartedAt,
          totalElapsedMs: now - workerStartedAt,
          message: `Independent QA tìm thấy ${qaFeedback.length} lỗi; đang mở repair pass ${iteration + 1}/${maxReviewPasses}`,
        })
      }
      throw new Error(`Independent Figma craft QA vẫn còn lỗi sau ${maxReviewPasses} pass: ${(qaFeedback ?? []).join('; ')}`)
    },
    readBack: (receipt) => base.readBack(receipt),
    verify: (plan: FigmaPreflightPlan, snapshot: FigmaArtifactSnapshot): Promise<VerificationResult> => base.verify(plan, snapshot),
  }
}

async function executeRun(
  threadId: string,
  target?: PlannedAction['target'],
): Promise<{ workspace: LifecycleWorkspaceState; results: ConnectorExecutionResult[] }> {
  let state = lifecycle.getRunState(threadId)
  if (!state) throw new Error('Lifecycle run does not exist')
  if (state.status === 'PARTIAL_FAILURE') state = transitionRunState(state, 'RETRY_EXECUTION', timestamp())
  else if (state.status === 'ACTIVE') state = transitionRunState(state, 'START_EXECUTION', timestamp())
  else if (state.status !== 'EXECUTING') return { workspace: workspaceFor(threadId), results: [] }
  lifecycle.saveRunState(state)

  const currentActionIds = new Set(state.pendingActions.map((action) => action.id))
  const work = outbox.listRun(state.id).filter((item) => (
    currentActionIds.has(item.action.id)
    && (!target || item.action.target === target)
  ))
  const results = await Promise.all(work.map(async (item) => {
    const payload = item.action.payload
    if (item.action.target === 'figma') {
      const plan = figmaArtifactPlanSchema.parse(payload.plan)
      const manifest = designSystemManifestSchema.parse(payload.manifest)
      const liveConnector = payload.connectorMode === 'live'
        ? new FigmaMcpArtifactConnector(figmaMcp, manifest, plan.target)
        : null
      const workerConfig = payload.designWorker && typeof payload.designWorker === 'object' && !Array.isArray(payload.designWorker)
        ? payload.designWorker as Record<string, unknown>
        : null
      const connector = liveConnector
        ? workerConfig?.mode === 'codex_mcp'
          ? withFigmaDesignWorker(liveConnector, threadId, manifest, workerConfig)
          : liveConnector
        : new MockFigmaArtifactConnector(manifest, plan.target, { store: mockFigmaStore })
      return executeConnectorAction({
        action: item.action,
        plan,
        ...(payload.preflight ? { preparedPreflight: figmaPreflightResultSchema.parse(payload.preflight) } : {}),
        connector,
        repository: outbox,
        onProgress: (event) => emitArtifactProgress(threadId, event),
      })
    } else if (item.action.target === 'jira') {
      return executeConnectorAction({
        action: item.action,
        plan: mockJiraPlanSchema.parse(payload.plan),
        connector: mockJira,
        repository: outbox,
        onProgress: (event) => emitArtifactProgress(threadId, event),
      })
    } else {
      return executeConnectorAction({
        action: item.action,
        plan: mockZdocPlanSchema.parse(payload.plan),
        connector: mockZdoc,
        repository: outbox,
        onProgress: (event) => emitArtifactProgress(threadId, event),
      })
    }
  }))

  const summary = outbox.summary(state.id)
  if (summary.status === 'verified') {
    exportMarkdownArtifact(state.productSpec)
    state = transitionRunState(state, 'START_VERIFICATION', timestamp())
    state = transitionRunState(state, 'VERIFY_SUCCESS', timestamp())
  } else {
    state = transitionRunState(state, 'PARTIAL_FAILURE', timestamp())
  }
  lifecycle.saveRunState(state)
  return { workspace: workspaceFor(threadId), results }
}

function artifactPlanPending(state: RunState): boolean {
  return state.status === 'WAITING_FOR_APPROVAL'
    && !state.pendingIntent
    && state.pendingActions.length > 0
    && state.pendingActions.every((action) => action.status === 'pending_approval')
}

// Explain *why* a Figma kickoff cannot be prepared yet, with the concrete next step,
// instead of a single opaque "cần ProductSpec có scope tại Delivery checkpoint".
function figmaPrepareBlockReason(state: RunState): string {
  if (state.phase !== 'DELIVERY' || state.status !== 'ACTIVE') {
    return 'Chưa tới bước tạo Figma. Hãy hoàn tất Discovery rồi chọn một option ở Decision để agent tổng hợp ProductSpec — sau đó mới tạo kickoff package.'
  }
  if (state.productSpec.requirements.length === 0) {
    return 'ProductSpec đang có 0 requirement nên chưa đủ scope cho Figma. Nếu bạn đã vẽ user flow / prototype trên canvas, hãy “Promote” nó thành ProductSpec trước; hoặc hoàn tất Decision để sinh scope, rồi tạo lại.'
  }
  return 'Chưa thể chuẩn bị Figma từ trạng thái hiện tại của thread này.'
}

async function prepareArtifactsForThread(
  threadId: string,
): Promise<{ workspace: LifecycleWorkspaceState; message: string; assistantMessage: ChatMessage }> {
  const workspace = workspaceFor(threadId)
  const state = workspace.runState
  if (artifactPlanPending(state)) {
    const message = 'Immutable artifact plan đã sẵn sàng. Hãy kiểm tra target và chọn “Duyệt & tạo”; chưa có external write nào chạy.'
    return {
      workspace,
      message,
      assistantMessage: history.addMessage(threadId, 'assistant', message),
    }
  }
  if (state.phase !== 'DELIVERY' || state.status !== 'ACTIVE') {
    throw new Error('Kickoff package chỉ có thể chuẩn bị tại Delivery checkpoint')
  }
  if (state.productSpec.requirements.length === 0) throw new Error('ProductSpec chưa có scope để tạo kickoff package')
  const startedAt = Date.now()
  const at = timestamp()
  const staged = {
    ...state,
    status: 'WAITING_FOR_APPROVAL',
    pendingIntent: null,
    pendingActions: artifactActionsFor(state, state.productSpec),
    lastCheckpointAt: at,
  } satisfies RunState
  const executableActions = await prepareExecutableActions(staged, staged.productSpec)
  lifecycle.savePreview({ ...staged, pendingActions: executableActions })
  const figmaAction = executableActions.find((action) => action.target === 'figma')
  const mode = figmaModeLabel(figmaAction)
  const message = `Kickoff package đã preflight trong ${seconds(Date.now() - startedAt)}: ${mode}, PRD Markdown và backlog mock. Hãy kiểm tra immutable target rồi duyệt tạo.`
  const assistantMessage = history.addMessage(threadId, 'assistant', message)
  return { workspace: workspaceFor(threadId), message, assistantMessage }
}

// Prepare a fresh Figma artifact from the same ProductSpec — either a plain regenerate or a
// refine guided by `feedback`. A revision label keeps the idempotency key unique, so this is a
// new artifact under the version Page and the previous design is preserved as a sibling.
async function regenerateArtifactsForThread(
  threadId: string,
  feedback?: string,
): Promise<{ workspace: LifecycleWorkspaceState; message: string; assistantMessage: ChatMessage }> {
  const state = workspaceFor(threadId).runState
  if (state.phase !== 'DELIVERY') {
    throw new Error('Chỉ có thể tạo lại Figma sau khi kickoff package đã tới Delivery.')
  }
  if (state.productSpec.requirements.length === 0) {
    throw new Error('ProductSpec chưa có scope để tạo lại Figma.')
  }
  if (state.status === 'EXECUTING' || state.status === 'VERIFYING') {
    throw new Error('Đang có một lần tạo Figma chạy dở; hãy đợi hoàn tất trước khi tạo bản mới.')
  }
  const startedAt = Date.now()
  const at = timestamp()
  const revisionLabel = `r${Date.now().toString(36)}`
  const stagedActions = artifactActionsFor(state, state.productSpec).map((action) => (
    action.target === 'figma' ? { ...action, id: `${action.id}:${revisionLabel}` } : action
  ))
  const staged = {
    ...state,
    status: 'WAITING_FOR_APPROVAL',
    pendingIntent: null,
    pendingActions: stagedActions,
    lastCheckpointAt: at,
  } satisfies RunState
  const executableActions = await prepareExecutableActions(staged, staged.productSpec, feedback, revisionLabel)
  lifecycle.savePreview({ ...staged, pendingActions: executableActions })
  const figmaAction = executableActions.find((action) => action.target === 'figma')
  const mode = figmaModeLabel(figmaAction)
  const intent = feedback ? `refine theo feedback: “${feedback}”` : 'tạo một bản thiết kế mới'
  const message = `Đã chuẩn bị ${mode} bản mới (${intent}) trong ${seconds(Date.now() - startedAt)} — một artifact riêng, bản Figma cũ vẫn được giữ. Kiểm tra immutable plan rồi duyệt để tạo.`
  const assistantMessage = history.addMessage(threadId, 'assistant', message)
  return { workspace: workspaceFor(threadId), message, assistantMessage }
}

function approvedFigmaTargetHash(action: PlannedAction | undefined): string | null {
  const plan = action?.payload.plan
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null
  const target = (plan as Record<string, unknown>).target
  if (!target || typeof target !== 'object' || Array.isArray(target)) return null
  const targetHash = (target as Record<string, unknown>).targetHash
  return typeof targetHash === 'string' ? targetHash : null
}

async function reprepareFigmaForCurrentTarget(
  threadId: string,
): Promise<import('@pm-agent/domain').ApproveChangeOutput> {
  const state = workspaceFor(threadId).runState
  if (state.phase !== 'DELIVERY' || state.status !== 'PARTIAL_FAILURE') {
    throw new Error('Chỉ có thể rebind Figma sau một artifact execution chưa hoàn tất')
  }
  const context = figmaExecutionContext()
  if (context.connectorMode !== 'live') {
    throw new Error('Figma live target chưa sẵn sàng. Mở Figma setup và allowlist lại Page ZDS trước khi retry.')
  }
  const oldFigmaAction = state.pendingActions.find((action) => action.target === 'figma')
  const previousTargetHash = approvedFigmaTargetHash(oldFigmaAction)
  if (previousTargetHash === context.target.targetHash) {
    throw new Error('Figma target không đổi; action hiện tại có thể retry trực tiếp')
  }
  const revision = context.target.targetHash.slice(0, 12)
  const baseActions = artifactActionsFor(state, state.productSpec).map((action) => (
    action.target === 'figma'
      ? { ...action, id: `${action.id}:rebind:${revision}` }
      : action
  ))
  const prepared = await prepareExecutableActions({ ...state, pendingActions: baseActions }, state.productSpec)
  const figmaAction = prepared.find((action) => action.target === 'figma')
  if (!figmaAction) throw new Error('Figma rebind preflight did not produce an executable action')
  const at = timestamp()
  const staged = transitionRunState({
    ...state,
    pendingIntent: null,
    pendingActions: [figmaAction],
  }, 'REPREPARE_ARTIFACT', at)
  lifecycle.savePreview(staged)
  const message = 'Figma plugin đã reconnect nên immutable target cũ hết hiệu lực. Plan Figma mới đã preflight; PRD và backlog đã verified vẫn được giữ nguyên. Hãy duyệt lại riêng payload Figma.'
  history.addMessage(threadId, 'assistant', message)
  return { ...workspaceFor(threadId), message }
}

async function approveArtifactsForThread(
  threadId: string,
): Promise<{ workspace: LifecycleWorkspaceState; message: string; assistantMessage: ChatMessage }> {
  const state = workspaceFor(threadId).runState
  if (!artifactPlanPending(state)) throw new Error('Không có artifact plan đang chờ duyệt')
  const at = timestamp()
  const approved = approveActions(state.pendingActions, at)
  const approvedState = transitionRunState({ ...state, pendingActions: approved.actions }, 'APPROVE', at)
  lifecycle.commitApprovedChange(approvedState, approved.approvals)
  const executed = await executeRun(threadId)
  const message = executed.workspace.execution?.status === 'verified'
    ? `Kickoff package đã verified: Figma, backlog mock và PRD Markdown tại ${markdownArtifactPath(executed.workspace.runState.productSpec)}.${timingSummary(executed.results)}`
    : `Artifact execution chưa hoàn tất; xem trạng thái từng target để retry.${timingSummary(executed.results)}`
  const assistantMessage = history.addMessage(threadId, 'assistant', message)
  return { workspace: executed.workspace, message, assistantMessage }
}

function exposeProfile(profile: Omit<ProviderProfile, 'hasCredential'>): ProviderProfile {
  const envName = providerEnv[profile.providerId]
  const hasCredential = profile.providerId === 'mock'
    || profile.providerId === 'codex'
    || secrets.has(profile.id)
    || Boolean(envName && process.env[envName])
  return { ...profile, hasCredential }
}

async function figmaStatus(): Promise<FigmaSetupStatus> {
  const runtime = await figmaRuntime.status()
  const storedTarget = figmaIntegration.getActiveTarget()
  const matchingSession = storedTarget
    ? runtime.sessions.find((session) => (
      session.sessionId === storedTarget.sessionId
      && session.fileName === storedTarget.fileName
    ))
    : null
  let target: FigmaTargetBinding | null = null
  if (storedTarget && matchingSession) {
    try {
      const pages = await figmaMcp.pages(storedTarget.sessionId)
      if (pages.pages.some((page) => page.id === storedTarget.pageId && page.name === storedTarget.pageName)) {
        target = storedTarget
      }
    } catch {
      target = null
    }
  }
  const context = target ? figmaIntegration.getContext(target.targetHash) : null
  return {
    ...runtime,
    target,
    designSystem: context ? summarizeFigmaDesignSystemContext(context) : null,
  }
}

async function allowFigmaTarget(sessionId: string, forceCapture: boolean): Promise<FigmaSetupStatus> {
  const health = await figmaMcp.health()
  const session = health.sessions.find((item) => item.sessionId === sessionId)
  if (!session) throw new Error('Figma session không còn tồn tại. Hãy mở lại plugin.')
  const pages = await figmaMcp.pages(sessionId)
  const currentPage = pages.pages.find((page) => page.id === pages.currentPageId)
  if (!currentPage) throw new Error('Không đọc được Page hiện tại từ Figma session.')
  if (isManagedFigmaArtifactPage(currentPage.name)) {
    throw new Error(
      `"${currentPage.name}" là Page output do PM Lifecycle tạo, không phải nguồn ZDS. `
      + 'Hãy mở Page chứa component trong [PUBLIC] Zalo Mini App Framework 2.0 - dup rồi thử lại.',
    )
  }
  const activeTarget = figmaIntegration.getActiveTarget()
  const allowedAt = activeTarget?.sessionId === sessionId && activeTarget.pageId === pages.currentPageId
    ? activeTarget.allowedAt
    : timestamp()
  const target = await figmaMcp.pinTarget(sessionId, pages.currentPageId, allowedAt)

  const cached = forceCapture ? null : figmaIntegration.getContext(target.targetHash)
  if (!cached) {
    const capture = await figmaMcp.captureDesignSystem(target)
    const context = normalizeFigmaDesignSystemContext(capture, target, syntheticZaloDesignSystem, timestamp())
    if (context.mode !== 'live') {
      throw new Error(
        `Page "${target.pageName}" không cung cấp semantic ZDS bindings. `
        + 'Hãy mở đúng Page chứa các component ZDS rồi chọn lại nguồn.',
      )
    }
    figmaIntegration.saveActiveTarget(target)
    figmaIntegration.saveContext(context)
  } else {
    figmaIntegration.saveActiveTarget(target)
  }
  return figmaStatus()
}

function registerIpc(): void {
  ipcMain.handle('threads:list', (_event, query?: string) => history.listThreads(query).map(threadForRenderer))
  ipcMain.handle('threads:create', () => threadForRenderer(history.createThread()))
  ipcMain.handle('threads:get', (_event, threadId: string) => threadForRenderer(history.getThread(threadId)))
  ipcMain.handle('threads:messages', (_event, threadId: string, cursor?: string, limit?: number) => history.listMessagesPage(threadId, cursor, limit))
  ipcMain.handle('threads:export-bundle', (_event, threadId: string) => exportThreadBundle(threadId))
  ipcMain.handle('threads:archive', (_event, threadId: string) => history.archiveThread(threadId))
  ipcMain.handle('threads:set-provider', (_event, threadId: string, profileId: string, confirmPaid = false) => {
    const thread = history.getThread(threadId)
    if (thread.providerId === profileId) return threadForRenderer(thread)
    const profile = history.getProfile(profileId)
    const workspace = workspaceFor(threadId)
    assertProviderSwitchAllowed({
      activeTurn: activeRuns.has(threadId),
      execution: workspace.execution,
      targetCostMode: profile.costMode,
      confirmedPaid: confirmPaid,
    })
    const handoff = createHandoffPackage({
      thread,
      state: workspace.runState,
      toProfileId: profile.id,
      toModelId: profile.modelId,
      createdAt: timestamp(),
    })
    return threadForRenderer(history.switchThreadProvider(threadId, profile.id, providers.get(profile.providerId).capabilities, handoff))
  })

  ipcMain.handle('canvas:save', (_event, threadId: string, snapshot: unknown) => history.saveCanvas(threadId, snapshot))
  ipcMain.handle('canvas:record-execution', (_event, receipt: CanvasExecutionReceipt) => {
    history.getThread(receipt.threadId)
    canvasBridge?.acknowledge(receipt)
    if (receipt.requestId) {
      const pending = pendingCanvasExecutions.get(receipt.requestId)
      if (!pending || pending.threadId !== receipt.threadId) throw new Error('Canvas receipt không khớp request đang chờ')
      if (pending.program.mode === 'operations' && receipt.appliedOperationCount !== pending.program.operations.length) {
        throw new Error(`Canvas chỉ áp dụng ${receipt.appliedOperationCount}/${pending.program.operations.length} thao tác`)
      }
      const visibleOperations = pending.program.operations.filter((operation) => operation.op === 'create_node' || operation.op === 'connect').length
      if (visibleOperations > receipt.createdShapeIds.length) {
        throw new Error(`Canvas read-back thiếu phần tử: ${receipt.createdShapeIds.length}/${visibleOperations}`)
      }
      const visualErrors = receipt.lintIssues?.filter((issue) => issue.severity === 'error') ?? []
      if (visualErrors.length > 0) {
        throw new Error(`Canvas visual verification failed: ${visualErrors.map((issue) => issue.message).join(' ')}`)
      }
      pendingCanvasExecutions.delete(receipt.requestId)
      return history.addMessage(receipt.threadId, 'assistant', canvasReceiptMessage(pending.program, receipt, pending.kind))
    }
    if (receipt.source === 'developer') {
      history.addMessage(receipt.threadId, 'system', `[Canvas Bridge] Applied ${receipt.appliedOperationCount} operations; read back ${receipt.shapeCount} shapes.`)
    }
    return null
  })
  ipcMain.handle('canvas:record-failure', (_event, failure: CanvasExecutionFailure) => {
    history.getThread(failure.threadId)
    const pending = pendingCanvasExecutions.get(failure.requestId)
    if (!pending || pending.threadId !== failure.threadId) return null
    pendingCanvasExecutions.delete(failure.requestId)
    return history.addMessage(failure.threadId, 'assistant', `Không thể cập nhật canvas nên mình chưa ghi nhận thay đổi: ${failure.error}`)
  })
  ipcMain.handle('canvas:propose-command', (_event, threadId: string, command: CanvasGestureCommand) => {
    const current = workspaceFor(threadId)
    const intent = changeIntentFromCanvasCommand(current.runState.productSpec, command)
    const staged = stageChangePreview(threadId, intent, timestamp())
    const message = staged.created
      ? `Canvas đề xuất loại ${intent.targetEntityId}. ProductSpec chưa thay đổi; hãy kiểm tra impact và duyệt change plan.`
      : `Change plan cho ${intent.targetEntityId} vẫn đang chờ duyệt; không tạo proposal trùng.`
    if (staged.created) {
      history.addMessage(threadId, 'user', `[Canvas] Đề xuất loại ${intent.targetEntityId} khỏi ProductSpec`)
      history.addMessage(threadId, 'assistant', message)
    }
    return { ...staged.workspace, message }
  })

  ipcMain.handle('lifecycle:get-workspace', (_event, threadId: string) => workspaceFor(threadId))
  ipcMain.handle('lifecycle:preview-promotion', (_event, threadId: string, canvas: CanvasDocumentContext) => {
    const workspace = workspaceFor(threadId)
    const thread = history.getThread(threadId)
    const at = timestamp()
    const productSpec = synthesizeProductSpecFromCanvas(workspace.runState.productSpec, canvas, thread.title, at)
    const payloadHash = hashConnectorPayload(productSpec as unknown as Record<string, unknown>)
    const preview: CanvasPromotionPreview = {
      schemaVersion: 1,
      payloadHash,
      productSpec,
      sourceShapeIds: canvas.shapes.filter((shape) => shape.type !== 'arrow' && shape.semanticId && shape.nodeKind).map((shape) => shape.id),
      assumptions: [
        'Mỗi semantic canvas node được chuyển thành một requirement và screen để giữ flow inspectable.',
        'Design System roles mặc định là app-header và primary-button; strict Figma preflight sẽ kiểm tra lại.',
      ],
    }
    promotionPreviews.set(threadId, preview)
    return preview
  })
  ipcMain.handle('lifecycle:commit-promotion', async (_event, threadId: string, payloadHash: string) => {
    const preview = promotionPreviews.get(threadId)
    if (!preview || preview.payloadHash !== payloadHash) throw new Error('Promotion preview không tồn tại hoặc payload đã thay đổi')
    const current = workspaceFor(threadId).runState
    if (preview.productSpec.version !== current.productSpec.version + 1) throw new Error('ProductSpec đã thay đổi; hãy preview promotion lại')
    const at = timestamp()
    const baseActions = artifactActionsFor(current, preview.productSpec)
    const promoted = {
      ...current,
      phase: 'DELIVERY',
      status: 'WAITING_FOR_APPROVAL',
      productSpec: preview.productSpec,
      pendingIntent: null,
      pendingActions: baseActions,
      pendingClarification: null,
      lastCheckpointAt: at,
    } satisfies RunState
    const executableActions = await prepareExecutableActions(promoted, preview.productSpec)
    lifecycle.commitPromotedSpec({ ...promoted, pendingActions: executableActions })
    history.setThreadPhase(threadId, 'deliver')
    history.addMessage(threadId, 'assistant', `Đã xác nhận ProductSpec v${preview.productSpec.version} từ ${preview.sourceShapeIds.length} canvas nodes. Figma, PRD Markdown và backlog mock đã preflight; hãy duyệt immutable artifact plan trước khi tạo.`)
    promotionPreviews.delete(threadId)
    return workspaceFor(threadId)
  })
  ipcMain.handle('lifecycle:prepare-artifacts', async (_event, threadId: string) => {
    return (await prepareArtifactsForThread(threadId)).workspace
  })
  ipcMain.handle('lifecycle:regenerate-artifacts', async (_event, threadId: string, feedback?: string) => {
    return (await regenerateArtifactsForThread(threadId, feedback?.trim() || undefined)).workspace
  })
  ipcMain.handle('lifecycle:approve-artifacts', async (_event, threadId: string) => {
    const result = await approveArtifactsForThread(threadId)
    return { ...result.workspace, message: result.message }
  })
  ipcMain.handle('lifecycle:reject-artifacts', (_event, threadId: string) => {
    const state = workspaceFor(threadId).runState
    if (state.status !== 'WAITING_FOR_APPROVAL' || state.pendingIntent || state.pendingActions.length === 0) {
      throw new Error('Không có artifact plan đang chờ duyệt')
    }
    const at = timestamp()
    const rejected = rejectActions(state.pendingActions, at)
    const rejectedState = transitionRunState({ ...state, pendingActions: rejected.actions }, 'REJECT', at)
    lifecycle.commitRejectedChange(rejectedState, rejected.approvals)
    const message = 'Đã giữ ProductSpec nhưng hủy artifact writes; không connector nào được gọi.'
    history.addMessage(threadId, 'assistant', message)
    return { ...workspaceFor(threadId), message }
  })
  ipcMain.handle('lifecycle:show-document', (_event, threadId: string) => {
    const path = markdownArtifactPath(workspaceFor(threadId).runState.productSpec)
    if (!existsSync(path)) throw new Error('PRD Markdown chưa được tạo')
    shell.showItemInFolder(path)
  })
  ipcMain.handle('lifecycle:approve-change', async (_event, threadId: string) => {
    const workspace = workspaceFor(threadId)
    const { runState } = workspace
    if (runState.status !== 'WAITING_FOR_APPROVAL' || !runState.pendingIntent) {
      throw new Error('Không có change plan đang chờ duyệt')
    }
    const preview = createImpactPreview(runState.productSpec, runState.pendingIntent, runState.id, runState.lastCheckpointAt)
    const currentHashes = runState.pendingActions.map((action) => action.payloadHash).join(':')
    const previewHashes = preview.actions.map((action) => action.payloadHash).join(':')
    if (currentHashes !== previewHashes) throw new Error('Change plan đã thay đổi và cần preview lại')

    const executableActions = await prepareExecutableActions(runState, preview.after)
    const decidedAt = timestamp()
    const approved = approveActions(executableActions, decidedAt)
    const approvedState = transitionRunState({
      ...runState,
      productSpec: preview.after,
      pendingIntent: null,
      pendingActions: approved.actions,
    }, 'APPROVE', decidedAt)
    lifecycle.commitApprovedChange(approvedState, approved.approvals)
    history.setThreadPhase(threadId, 'change')
    const executed = await executeRun(threadId)
    const message = executed.workspace.execution?.status === 'verified'
      ? `Đã duyệt ProductSpec v${preview.after.version} và read-back verified cả Figma, Mock Jira, Mock Zdoc.`
      : `Đã duyệt ProductSpec v${preview.after.version}; một số artifact cần retry sau khi connector sẵn sàng.`
    history.addMessage(threadId, 'assistant', message)
    return { ...executed.workspace, message }
  })
  ipcMain.handle('lifecycle:reject-change', (_event, threadId: string) => {
    const workspace = workspaceFor(threadId)
    if (workspace.runState.status !== 'WAITING_FOR_APPROVAL' || !workspace.runState.pendingIntent) {
      throw new Error('Không có change plan đang chờ quyết định')
    }
    const decidedAt = timestamp()
    const rejected = rejectActions(workspace.runState.pendingActions, decidedAt)
    const next = transitionRunState({
      ...workspace.runState,
      pendingIntent: null,
      pendingActions: rejected.actions,
    }, 'REJECT', decidedAt)
    lifecycle.commitRejectedChange(next, rejected.approvals)
    history.setThreadPhase(threadId, 'deliver')
    const message = `Đã từ chối change plan; ProductSpec vẫn ở v${next.productSpec.version} và không có artifact write nào được queue.`
    history.addMessage(threadId, 'assistant', message)
    return { ...workspaceFor(threadId), message }
  })
  ipcMain.handle('lifecycle:retry-action', async (_event, threadId: string, target: PlannedAction['target']) => {
    if (target === 'figma') {
      const state = workspaceFor(threadId).runState
      const oldFigmaAction = state.pendingActions.find((action) => action.target === 'figma')
      const oldTargetHash = approvedFigmaTargetHash(oldFigmaAction)
      const context = figmaExecutionContext()
      if (oldFigmaAction?.payload.connectorMode === 'live' && context.connectorMode !== 'live') {
        throw new Error('Figma live target chưa sẵn sàng. Mở Figma setup và allowlist lại Page ZDS trước khi retry.')
      }
      if (oldTargetHash && context.connectorMode === 'live' && oldTargetHash !== context.target.targetHash) {
        return reprepareFigmaForCurrentTarget(threadId)
      }
    }
    const executed = await executeRun(threadId, target)
    const message = executed.workspace.execution?.status === 'verified'
      ? 'Retry hoàn tất; mọi artifact đã được read-back verified.'
      : `${target} vẫn chưa verified; các target đã thành công được giữ nguyên.`
    history.addMessage(threadId, 'assistant', message)
    return { ...executed.workspace, message }
  })
  ipcMain.handle('lifecycle:advance-decision', async (_event, threadId: string, answers: Record<string, string>) => {
    assertNoActiveProviderTurn(threadId)
    const workspace = workspaceFor(threadId)
    if (workspace.runState.phase !== 'DISCOVERY' || workspace.runState.status !== 'ACTIVE' || workspace.reasoning?.phase !== 'discover') {
      throw new Error('Discovery checkpoint chưa sẵn sàng')
    }
    const questions = workspace.reasoning.phaseData.questions
    const normalizedAnswers = normalizeClarificationAnswers(questions, answers)
    const thread = history.getThread(threadId)
    const profile = history.getProfile(thread.providerId)
    const answerText = questions.map((question) => `${question.prompt}: ${normalizedAnswers[question.id]}`).join('\n')
    history.addMessage(threadId, 'user', answerText)
    const turnId = history.startTurn(threadId, answerText)
    const controller = new AbortController()
    let turnFinished = false
    activeRuns.set(threadId, controller)
    try {
      const apiKey = secrets.get(profile.id)
      const response = await providers.get(profile.providerId).reason({
        threadId,
        phase: 'decide',
        message: answerText,
        recentMessages: history.recentMessages(threadId),
        remoteRef: history.getActiveRemoteRef(threadId, profile.id),
      }, { modelId: profile.modelId, ...(apiKey ? { apiKey } : {}) }, controller.signal)
      const proposal = acceptCompletedProviderEvents(workspace.runState, response.events, 'decide')
      const advanced = advanceReasoningPhase(workspace.runState, proposal.result, timestamp())
      lifecycle.saveReasoningCheckpoint(advanced.state, advanced.checkpoint)
      history.setThreadPhase(threadId, 'decide')
      history.addMessage(threadId, 'assistant', proposal.result.message)
      history.saveProviderSegment(threadId, profile.id, profile.modelId, response.remoteRef)
      history.completeTurn(turnId, 'completed', response.events)
      turnFinished = true
      return workspaceFor(threadId)
    } catch (error) {
      if (!turnFinished) {
        const at = timestamp()
        history.completeTurn(turnId, controller.signal.aborted ? 'cancelled' : 'failed', controller.signal.aborted
          ? [{ type: 'turn_cancelled', sequence: 0, at }]
          : [{ type: 'turn_failed', sequence: 0, at, error: 'Provider turn failed' }])
      }
      throw error
    } finally {
      activeRuns.delete(threadId)
    }
  })
  ipcMain.handle('lifecycle:select-decision', (_event, threadId: string, optionId: string, customTitle?: string) => {
    const workspace = workspaceFor(threadId)
    if (workspace.runState.phase === 'DELIVERY' && workspace.runState.status === 'ACTIVE') return workspace
    const decision = lifecycle.getLatestReasoningCheckpoint(workspace.runState.id)?.result
    if (workspace.runState.phase !== 'DECISION'
      || workspace.runState.status !== 'WAITING_FOR_DECISION'
      || decision?.phase !== 'decide') {
      throw new Error('Decision không còn ở trạng thái chờ lựa chọn')
    }
    const option = decision.phaseData.options.find((item) => item.id === optionId)
    if (!option && optionId !== customDecisionOptionId) throw new Error('Phương án không tồn tại')
    const selectedTitle = option?.title ?? customTitle?.trim()
    if (!selectedTitle) throw new Error('Phương án không tồn tại')
    const selectedAt = timestamp()
    const transitioned = selectDecisionOption(workspace.runState, decision, optionId, selectedAt, customTitle)
    const productSpec = synthesizeProductSpecFromDecision({
      current: workspace.runState.productSpec,
      threadTitle: history.getThread(threadId).title,
      messages: history.recentMessages(threadId),
      decision,
      selectedOptionId: optionId,
      ...(customTitle ? { customTitle } : {}),
      selectedAt,
    })
    const next = { ...transitioned, productSpec }
    lifecycle.commitSynthesizedSpec(next)
    history.setThreadPhase(threadId, 'deliver')
    history.addMessage(threadId, 'user', `Đã chọn phương án: ${selectedTitle}`)
    history.addMessage(threadId, 'assistant', deliveryStatusMessage(next.productSpec, selectedTitle))
    return workspaceFor(threadId)
  })

  ipcMain.handle('figma:status', () => figmaStatus())
  ipcMain.handle('figma:start', async () => {
    await figmaRuntime.start()
    return figmaStatus()
  })
  ipcMain.handle('figma:allow-target', (_event, sessionId: string) => allowFigmaTarget(sessionId, true))
  ipcMain.handle('figma:refresh-design-system', () => {
    const target = figmaIntegration.getActiveTarget()
    if (!target) throw new Error('Chưa có Figma target trong allowlist.')
    return allowFigmaTarget(target.sessionId, true)
  })
  ipcMain.handle('figma:show-manifest', () => {
    if (!existsSync(figmaRuntime.manifestPath)) throw new Error('Figma plugin chưa được build. Chạy ./run.sh setup trước.')
    shell.showItemInFolder(figmaRuntime.manifestPath)
  })
  ipcMain.handle('figma:open-control-plane', async () => {
    const status = await figmaRuntime.start()
    if (status.runtime !== 'ready') throw new Error(status.detail)
    await shell.openExternal(figmaRuntime.controlPlaneUrl)
  })

  ipcMain.handle('providers:list', () => history.listProfiles().map(exposeProfile))
  ipcMain.handle('providers:configure', (_event, input: ConfigureProviderInput) => {
    const profile = history.configureProfile(input.profileId, input.modelId)
    if (input.apiKey?.trim()) secrets.set(input.profileId, input.apiKey.trim())
    return exposeProfile(profile)
  })
  ipcMain.handle('providers:probe', async (_event, profileId: string) => {
    const profile = history.getProfile(profileId)
    const apiKey = secrets.get(profile.id)
    return providers.get(profile.providerId).probe({
      modelId: profile.modelId,
      ...(apiKey ? { apiKey } : {}),
    })
  })

  ipcMain.handle('chat:send', async (_event, input: SendChatInput) => {
    assertNoActiveProviderTurn(input.threadId)
    if (process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER) {
      console.log(`[chat-turn] start ${input.threadId} ${input.content.slice(0, 48)}`)
    }
    const thread = history.getThread(input.threadId)
    const profile = history.getProfile(thread.providerId)
    const userMessage = history.addMessage(input.threadId, 'user', input.content.trim())
    const turnId = history.startTurn(input.threadId, input.content.trim())
    const controller = new AbortController()
    let turnFinished = false
    activeRuns.set(input.threadId, controller)
    try {
      const slashCommand = parseSlashCommand(input.content)
      let routedContent = input.content
      if (slashCommand?.kind === 'canvas_flow') {
        routedContent = `Vẽ user flow ${slashCommand.prompt || 'MVP dựa trên ProductSpec hiện tại'}`
      } else if (slashCommand?.kind === 'canvas_prototype') {
        routedContent = `Tạo prototype ${slashCommand.prompt || 'các màn hình MVP dựa trên ProductSpec hiện tại'}`
      } else if (slashCommand?.kind === 'studio_explore') {
        routedContent = `Cùng tôi khám phá ${slashCommand.prompt || 'ý tưởng hiện tại'}. Chỉ trao đổi và đề xuất góc nhìn; chưa vẽ hoặc sửa canvas.`
      } else if (slashCommand?.kind === 'studio_critique') {
        routedContent = `Phản biện ${slashCommand.prompt || input.selection?.label || 'ý tưởng hiện tại'}. Chỉ critique và nêu điểm feedback; chưa sửa canvas.`
      } else if (slashCommand?.kind === 'studio_sketch') {
        routedContent = `Phác trực quan ${slashCommand.prompt || 'ý tưởng hiện tại'} trên canvas để cùng feedback.`
      } else if (slashCommand?.kind === 'studio_refine') {
        routedContent = `Sửa đúng vùng canvas đang chọn: ${slashCommand.prompt || 'làm rõ hierarchy và nội dung'}`
      }
      const appOwnedReply = (
        message: string,
        providerEvents: ProviderEvent[] = [],
        remoteRef?: string | null,
      ): {
        userMessage: ChatMessage
        assistantMessage: ChatMessage
        commands: []
        suggestions: []
        canvasProgram: CanvasProgram
        canvasProgramSource: 'none'
        canvasRequestId: null
      } => {
        const assistantMessage = history.addMessage(input.threadId, 'assistant', message)
        if (remoteRef !== undefined) {
          history.saveProviderSegment(input.threadId, profile.id, profile.modelId, remoteRef)
        }
        history.completeTurn(turnId, 'completed', providerEvents)
        turnFinished = true
        return {
          userMessage,
          assistantMessage,
          commands: [],
          suggestions: [],
          canvasProgram: { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null },
          canvasProgramSource: 'none',
          canvasRequestId: null,
        }
      }
      if (slashCommand?.kind === 'help') return appOwnedReply(slashHelpMessage())
      if (slashCommand?.kind === 'invalid') {
        return appOwnedReply(`Slash command không hợp lệ: ${slashCommand.command}\n\n${slashHelpMessage()}`)
      }
      if (slashCommand?.kind === 'canvas_diagram') {
        const program = planDiagramScene(slashCommand.diagram)
        const diagramRequestId = `canvas-request:${turnId}`
        pendingCanvasExecutions.set(diagramRequestId, { threadId: input.threadId, program, kind: 'draw' })
        const diagramLabels: Record<typeof slashCommand.diagram, string> = {
          sequence: 'sequence diagram', state: 'state machine', mindmap: 'mind map', er: 'ER data model',
        }
        const assistantMessage = history.addMessage(
          input.threadId, 'assistant',
          `Mình đã dựng ${diagramLabels[slashCommand.diagram]} (${program.title ?? program.summary}) trên canvas; sau checkpoint sẽ có read-back để bạn review.`,
        )
        history.saveProviderSegment(input.threadId, profile.id, profile.modelId, null)
        history.completeTurn(turnId, 'completed', [])
        turnFinished = true
        return {
          userMessage,
          assistantMessage,
          commands: [],
          suggestions: [],
          canvasProgram: program,
          canvasProgramSource: 'deterministic_fallback' as const,
          canvasRequestId: diagramRequestId,
        }
      }
      if (slashCommand?.kind === 'figma_status') {
        const status = await figmaStatus()
        const workspace = workspaceFor(input.threadId)
        const connection = status.pluginConnected
          ? `${status.sessions.length} plugin session`
          : 'plugin chưa kết nối'
        const target = status.target
          ? `${status.target.fileName} · ${status.target.pageName}`
          : 'chưa allowlist target'
        const guard = status.designSystem ? `${status.designSystem.mode} · ${status.designSystem.componentCount} component mapping` : 'chưa capture Design System'
        const execution = workspace.execution?.status ?? workspace.runState.status
        return appOwnedReply(`Figma status: ${connection}; target: ${target}; guard: ${guard}; workflow: ${execution}.`)
      }
      if (slashCommand?.kind === 'figma_retry') {
        const failedFigma = workspaceFor(input.threadId).execution?.actions.some((action) => (
          action.target === 'figma' && (action.status === 'failed' || action.status === 'verification_failed')
        ))
        if (!failedFigma) return appOwnedReply('Không có Figma action lỗi cần retry.')
        const executed = await executeRun(input.threadId, 'figma')
        return appOwnedReply(executed.workspace.execution?.status === 'verified'
          ? `Figma retry đã verified.${timingSummary(executed.results)}`
          : `Figma retry chưa verified.${timingSummary(executed.results)}`)
      }
      if (slashCommand?.kind === 'figma_approve') {
        if (!artifactPlanPending(workspaceFor(input.threadId).runState)) {
          return appOwnedReply('Không có immutable Figma plan đang chờ. Chạy /figma prepare trước.')
        }
        const result = await approveArtifactsForThread(input.threadId)
        history.completeTurn(turnId, 'completed', [])
        turnFinished = true
        return {
          userMessage,
          assistantMessage: result.assistantMessage,
          commands: [],
          suggestions: [],
          canvasProgram: { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null },
          canvasProgramSource: 'none',
          canvasRequestId: null,
        }
      }
      if (slashCommand?.kind === 'figma_regenerate' || slashCommand?.kind === 'figma_refine') {
        const feedback = slashCommand.kind === 'figma_refine' ? slashCommand.prompt.trim() : ''
        if (slashCommand.kind === 'figma_refine' && !feedback) {
          return appOwnedReply('Hãy mô tả bạn muốn sửa gì, ví dụ: `/figma refine làm hero lớn hơn, thêm bản đồ ở màn theo dõi`.')
        }
        const result = await regenerateArtifactsForThread(input.threadId, feedback || undefined)
        history.completeTurn(turnId, 'completed', [])
        turnFinished = true
        return {
          userMessage,
          assistantMessage: result.assistantMessage,
          commands: [],
          suggestions: [],
          canvasProgram: { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null },
          canvasProgramSource: 'none',
          canvasRequestId: null,
        }
      }
      if (slashCommand?.kind === 'figma_prepare' || slashCommand?.kind === 'figma_create') {
        const state = workspaceFor(input.threadId).runState
        const canPrepare = state.phase === 'DELIVERY'
          && state.status === 'ACTIVE'
          && state.productSpec.requirements.length > 0
        if (!artifactPlanPending(state) && !canPrepare) {
          return appOwnedReply(figmaPrepareBlockReason(state))
        }
        const result = slashCommand.kind === 'figma_create' && artifactPlanPending(state)
          ? await approveArtifactsForThread(input.threadId)
          : await prepareArtifactsForThread(input.threadId)
        history.completeTurn(turnId, 'completed', [])
        turnFinished = true
        return {
          userMessage,
          assistantMessage: result.assistantMessage,
          commands: [],
          suggestions: [],
          canvasProgram: { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null },
          canvasProgramSource: 'none',
          canvasRequestId: null,
        }
      }

      const currentWorkspace = workspaceFor(input.threadId)
      if (currentWorkspace.runState.phase === 'DISCOVERY'
        && currentWorkspace.runState.status === 'ACTIVE'
        && currentWorkspace.reasoning?.phase === 'discover') {
        const questions = currentWorkspace.reasoning.phaseData.questions
        const freeformAnswers = mapFreeformDiscoveryAnswers(questions, routedContent)
        if (freeformAnswers) {
          const normalizedAnswers = normalizeClarificationAnswers(questions, freeformAnswers)
          const answerText = questions
            .map((question) => `${question.prompt}: ${normalizedAnswers[question.id]}`)
            .join('\n')
          const apiKey = secrets.get(profile.id)
          const response = await providers.get(profile.providerId).reason({
            threadId: input.threadId,
            phase: 'decide',
            message: answerText,
            recentMessages: history.recentMessages(input.threadId),
            remoteRef: history.getActiveRemoteRef(input.threadId, profile.id),
          }, {
            modelId: profile.modelId,
            ...(apiKey ? { apiKey } : {}),
          }, controller.signal)
          const proposal = acceptCompletedProviderEvents(currentWorkspace.runState, response.events, 'decide')
          const advanced = advanceReasoningPhase(currentWorkspace.runState, proposal.result, timestamp())
          lifecycle.saveReasoningCheckpoint(advanced.state, advanced.checkpoint)
          history.setThreadPhase(input.threadId, 'decide')
          const assistantMessage = history.addMessage(input.threadId, 'assistant', proposal.result.message)
          history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
          history.completeTurn(turnId, 'completed', response.events)
          turnFinished = true
          return {
            userMessage,
            assistantMessage,
            commands: proposal.result.commands,
            suggestions: [],
            canvasProgram: { schemaVersion: 1, mode: 'none' as const, summary: '', operations: [], script: null },
            canvasProgramSource: 'none' as const,
            canvasRequestId: null,
          }
        }
      }

      const apiKey = secrets.get(profile.id)
      const forcedCanvasIntent: ProviderIntent | undefined = slashCommand?.kind === 'canvas_flow'
        || slashCommand?.kind === 'canvas_prototype'
        || slashCommand?.kind === 'studio_sketch'
        ? { kind: 'draw', target: null, artifactAction: null }
        : slashCommand?.kind === 'studio_refine'
          ? { kind: 'edit', target: input.selection?.entityId ?? null, artifactAction: null }
          : undefined
      const forcedConversation = slashCommand?.kind === 'studio_explore'
        || slashCommand?.kind === 'studio_critique'
      const provider = providers.get(profile.providerId)
      let response = await provider.reason({
        threadId: input.threadId,
        phase: thread.phase,
        message: routedContent,
        recentMessages: history.recentMessages(input.threadId),
        ...(input.selection ? { selection: input.selection } : {}),
        ...((forcedCanvasIntent || forcedConversation) && input.canvas ? { canvas: input.canvas } : {}),
        ...(input.canvasDiff ? { canvasDiff: input.canvasDiff } : {}),
        responseMode: forcedCanvasIntent ? 'creative' : 'route',
        ...(forcedCanvasIntent ? { intentHint: forcedCanvasIntent } : {}),
        remoteRef: history.getActiveRemoteRef(input.threadId, profile.id),
      }, {
        modelId: profile.modelId,
        ...(apiKey ? { apiKey } : {}),
      }, controller.signal)
      let proposal = acceptCompletedProviderEvents(workspaceFor(input.threadId).runState, response.events, thread.phase)
      let providerEvents = response.events
      const conversationSuggestions = response.suggestions
      const routedIntent = forcedConversation
        ? { kind: 'conversation', target: null, artifactAction: null } as const
        : forcedCanvasIntent ?? proposal.result.intent
      let effectiveSelection = input.selection
      if (routedIntent.kind === 'edit' && !effectiveSelection) {
        effectiveSelection = resolveCanvasSelection(
          [routedIntent.target, routedContent].filter(Boolean).join(' '),
          input.canvas,
        )
      }
      if (routedIntent.kind === 'edit' && !effectiveSelection) {
        return appOwnedReply(
          'Mình hiểu đây là yêu cầu sửa canvas, nhưng chưa có target đủ rõ. Hãy chọn một hoặc nhiều node, hoặc nhắc đúng tên node rồi gửi lại.',
          providerEvents,
          response.remoteRef,
        )
      }
      if (!forcedCanvasIntent && (routedIntent.kind === 'draw' || routedIntent.kind === 'edit')) {
        const creativeResponse = await provider.reason({
          threadId: input.threadId,
          phase: thread.phase,
          message: routedContent,
          recentMessages: history.recentMessages(input.threadId),
          ...(effectiveSelection ? { selection: effectiveSelection } : {}),
          ...(input.canvas ? { canvas: input.canvas } : {}),
          ...(input.canvasDiff ? { canvasDiff: input.canvasDiff } : {}),
          responseMode: 'creative',
          intentHint: {
            ...routedIntent,
            target: effectiveSelection?.entityId ?? routedIntent.target,
          },
          remoteRef: response.remoteRef,
        }, {
          modelId: profile.modelId,
          ...(apiKey ? { apiKey } : {}),
        }, controller.signal)
        const creativeProposal = acceptCompletedProviderEvents(
          workspaceFor(input.threadId).runState,
          creativeResponse.events,
          thread.phase,
        )
        providerEvents = resequenceProviderEvents(response.events, creativeResponse.events)
        response = creativeResponse
        proposal = creativeProposal
      }

      if (routedIntent.kind === 'artifact') {
        const artifactAction = routedIntent.artifactAction
        if (artifactAction === 'status') {
          const status = await figmaStatus()
          const workspace = workspaceFor(input.threadId)
          const connection = status.pluginConnected ? `${status.sessions.length} plugin session` : 'plugin chưa kết nối'
          const target = status.target ? `${status.target.fileName} · ${status.target.pageName}` : 'chưa allowlist target'
          const guard = status.designSystem ? `${status.designSystem.mode} · ${status.designSystem.componentCount} component mapping` : 'chưa capture Design System'
          const execution = workspace.execution?.status ?? workspace.runState.status
          return appOwnedReply(
            `Figma status: ${connection}; target: ${target}; guard: ${guard}; workflow: ${execution}.`,
            providerEvents,
            response.remoteRef,
          )
        }
        if (artifactAction === 'retry') {
          const failedFigma = workspaceFor(input.threadId).execution?.actions.some((action) => (
            action.target === 'figma' && (action.status === 'failed' || action.status === 'verification_failed')
          ))
          if (!failedFigma) {
            return appOwnedReply('Không có Figma action lỗi cần retry.', providerEvents, response.remoteRef)
          }
          const executed = await executeRun(input.threadId, 'figma')
          return appOwnedReply(
            executed.workspace.execution?.status === 'verified'
              ? `Figma retry đã verified.${timingSummary(executed.results)}`
              : `Figma retry chưa verified.${timingSummary(executed.results)}`,
            providerEvents,
            response.remoteRef,
          )
        }
        const artifactWorkspace = workspaceFor(input.threadId)
        const canPrepareArtifacts = artifactWorkspace.runState.phase === 'DELIVERY'
          && artifactWorkspace.runState.status === 'ACTIVE'
          && artifactWorkspace.runState.productSpec.requirements.length > 0
        if (artifactAction === 'approve' && !artifactPlanPending(artifactWorkspace.runState)) {
          return appOwnedReply(
            'Không có immutable Figma plan đang chờ. Hãy yêu cầu chuẩn bị Figma trước.',
            providerEvents,
            response.remoteRef,
          )
        }
        if (artifactAction !== 'approve' && !artifactPlanPending(artifactWorkspace.runState) && !canPrepareArtifacts) {
          return appOwnedReply(
            figmaPrepareBlockReason(artifactWorkspace.runState),
            providerEvents,
            response.remoteRef,
          )
        }
        const artifactResult = artifactAction === 'approve'
          ? await approveArtifactsForThread(input.threadId)
          : await prepareArtifactsForThread(input.threadId)
        history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
        history.completeTurn(turnId, 'completed', providerEvents)
        turnFinished = true
        return {
          userMessage,
          assistantMessage: artifactResult.assistantMessage,
          commands: [],
          suggestions: [],
          canvasProgram: { schemaVersion: 1, mode: 'none' as const, summary: '', operations: [], script: null },
          canvasProgramSource: 'none' as const,
          canvasRequestId: null,
        }
      }

      const canvasSyncIntent = Boolean(input.canvasDiff)
      const removalCommand = routedIntent.kind === 'change' && !canvasSyncIntent
        ? proposal.result.commands.find((command) => command.type === 'remove_card')
        : undefined
      let changePreview
      let responseMessage = proposal.result.message
      let commands = proposal.result.commands
      const canvasIntent = routedIntent.kind === 'draw' || routedIntent.kind === 'edit'
        ? routedIntent.kind
        : null
      const requiredCanvasProgram = canvasIntent
        ? planExplicitCanvasRequest(routedContent, effectiveSelection, {
          intent: canvasIntent,
          recentMessages: history.recentMessages(input.threadId),
          ...(input.canvas ? { canvas: input.canvas } : {}),
        })
        : undefined
      const providerCanvasProgram = canvasIntent
        ? proposal.result.canvasProgram?.mode && proposal.result.canvasProgram.mode !== 'none'
          ? proposal.result.canvasProgram
          : legacyCommandsToCanvasProgram(proposal.result.commands)
        : undefined
      const canvasProgram = providerCanvasProgram ?? requiredCanvasProgram
      const canvasProgramSource = canvasProgram
        ? providerCanvasProgram ? 'provider' as const : 'deterministic_fallback' as const
        : 'none' as const
      let canvasRequestId: string | null = null
      if (canvasSyncIntent && input.canvas) {
        const semanticNodes = input.canvas.shapes.filter((shape) => shape.semanticId && shape.nodeKind)
        const selected = effectiveSelection?.selectedShapeCount ?? 0
        responseMessage = `${proposal.result.message}\n\nCanvas context đã verified: ${semanticNodes.length} semantic node, ${input.canvas.bindings?.length ?? 0} kết nối${selected > 0 ? ` và ${selected} phần tử đang chọn` : ''}. ProductSpec chưa thay đổi.`
        commands = []
      } else if (removalCommand) {
        const workspace = workspaceFor(input.threadId)
        if (workspace.preview) {
          changePreview = workspace.preview
          responseMessage = 'Change plan hiện tại vẫn đang chờ duyệt; payload và before/after chưa thay đổi.'
          commands = [{ type: 'focus_card', query: workspace.preview.intent.targetEntityId }, { type: 'switch_view', view: 'change' }]
        } else {
          const resolution = resolveRemovalChangeIntent(workspace.runState.productSpec, {
            query: removalCommand.query,
            reason: routedContent.trim(),
            ...(input.selection ? { selectedEntityId: input.selection.entityId } : {}),
          })
          if (resolution.status === 'needs_user_input') {
            stageChangeAmbiguity(input.threadId, resolution.ambiguity, timestamp())
            responseMessage = resolution.ambiguity
            commands = [{ type: 'switch_view', view: 'change' }]
          } else {
            const target = workspace.runState.productSpec.requirements.find((item) => item.id === resolution.intent.targetEntityId)
            if (target?.status === 'removed') {
              responseMessage = `${target.id} đã bị loại khỏi ProductSpec v${workspace.runState.productSpec.version}; không tạo action trùng.`
              commands = [{ type: 'focus_card', query: target.id }, { type: 'switch_view', view: 'change' }]
            } else {
              const staged = stageChangePreview(input.threadId, resolution.intent, timestamp())
              changePreview = staged.workspace.preview ?? undefined
              responseMessage = `Đã phân tích ${changePreview?.affectedEntityIds.length ?? 0} entity bị ảnh hưởng. Chưa có artifact nào được ghi; hãy kiểm tra before/after và duyệt change plan.`
              commands = [...commands, { type: 'switch_view', view: 'change' }]
            }
          }
        }
      } else if (routedIntent.kind === 'promote') {
        responseMessage = 'Đang chuẩn bị ProductSpec preview từ canvas. Chưa có artifact nào được ghi.'
        commands = []
      } else if (canvasProgram?.mode && canvasProgram.mode !== 'none' && canvasIntent) {
        canvasRequestId = `canvas-request:${turnId}`
        pendingCanvasExecutions.set(canvasRequestId, {
          threadId: input.threadId,
          program: canvasProgram,
          kind: canvasIntent,
        })
        const activity = canvasIntent === 'draw'
          ? canvasProgram.sceneType === 'prototype'
            ? 'Mình đang hiện thực hóa các màn hình trên canvas; sau checkpoint sẽ có read-back để bạn review.'
            : 'Mình đang dựng scene trên canvas; sau checkpoint sẽ có read-back để bạn review.'
          : 'Mình đang cập nhật đúng vùng canvas đã chọn và sẽ xác nhận sau read-back.'
        responseMessage = `${proposal.result.message}\n\n${activity}`
      } else {
        const workspace = workspaceFor(input.threadId)
        if (workspace.runState.phase === 'IDEA_INTAKE'
          && proposal.result.phase === 'discover'
          && routedIntent.kind === 'discovery') {
          const advanced = advanceReasoningPhase(workspace.runState, proposal.result, timestamp())
          lifecycle.saveReasoningCheckpoint(advanced.state, advanced.checkpoint)
          responseMessage = 'Mình đã chuẩn hóa ý tưởng. Hãy khóa ba clarification bên dưới để tạo phương án.'
        }
      }
      const assistantMessage = history.addMessage(input.threadId, 'assistant', responseMessage)
      const switchCommand = commands.find((command) => command.type === 'switch_view')
      if (switchCommand?.type === 'switch_view') history.setThreadPhase(input.threadId, switchCommand.view)
      history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
      history.completeTurn(turnId, 'completed', providerEvents)
      turnFinished = true
      return {
        userMessage,
        assistantMessage,
        commands,
        suggestions: routedIntent.kind === 'conversation' ? conversationSuggestions : [],
        canvasProgram: canvasProgram ?? { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null },
        canvasProgramSource,
        canvasRequestId,
        ...(changePreview ? { changePreview } : {}),
      }
    } catch (error) {
      if (!turnFinished) {
        const at = timestamp()
        history.completeTurn(turnId, controller.signal.aborted ? 'cancelled' : 'failed', controller.signal.aborted
          ? [{ type: 'turn_cancelled', sequence: 0, at }]
          : [{ type: 'turn_failed', sequence: 0, at, error: 'Provider turn failed' }])
      }
      throw error
    } finally {
      activeRuns.delete(input.threadId)
      if (process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER) {
        console.log(`[chat-turn] end ${input.threadId} ${input.content.slice(0, 48)}`)
      }
    }
  })
  ipcMain.handle('chat:cancel', (_event, threadId: string) => activeRuns.get(threadId)?.abort())
  ipcMain.handle('demo:reset', () => resetDemoWorkspace())
  ipcMain.handle('dev-bridge:status', (): import('@pm-agent/domain').DevBridgeStatus => {
    const bridge = canvasBridge?.status ?? { running: false, port: null }
    const install = canvasSkillInstall
    return {
      schemaVersion: 1,
      running: bridge.running,
      port: bridge.port,
      skill: {
        installed: install ? install.status !== 'skipped' : false,
        id: CANVAS_SKILL_ID,
        version: CANVAS_SKILL_VERSION,
        dir: install?.skillDir ?? '',
        status: install?.status ?? 'unknown',
      },
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f7f8',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(moduleDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  if (process.env.PM_AGENT_SMOKE_CAPTURE) {
    mainWindow.webContents.once('did-finish-load', () => void runSmokeCheck(mainWindow!))
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(moduleDirectory, '../renderer/index.html'))
  }
}

async function runSmokeCheck(window: BrowserWindowType): Promise<void> {
  try {
    const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))
    const expectedFailureTarget = process.env.PM_AGENT_SMOKE_FAIL_TARGET ?? ''
    await wait(2_500)
    const expectedResetCount = Number(process.env.PM_AGENT_SMOKE_RESET_COUNT ?? 0)
    const resetSnapshots: string[] = []
    let resetControlReady = false
    for (let index = 0; index < expectedResetCount; index += 1) {
      if (index === 0) {
        resetControlReady = await window.webContents.executeJavaScript(`(async () => {
          const open = document.querySelector('.reset-demo-button');
          open?.click();
          await new Promise((resolve) => setTimeout(resolve, 50));
          const confirm = document.querySelector('.confirm-reset-button');
          confirm?.click();
          return Boolean(open && confirm);
        })()`) as boolean
        await wait(500)
      } else {
        await window.webContents.executeJavaScript(`window.pmAgent.demo.reset()`)
      }
      const snapshot = await window.webContents.executeJavaScript(`(async () => {
        const threads = await window.pmAgent.threads.list();
        const thread = await window.pmAgent.threads.get(threads[0].id);
        const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
        return JSON.stringify({
          threadCount: threads.length,
          threadId: thread.id,
          title: thread.title,
          messages: thread.messages.map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt })),
          specVersion: workspace.runState.productSpec.version
        });
      })()`) as string
      resetSnapshots.push(snapshot)
    }
    const reset = {
      count: expectedResetCount,
      controlReady: expectedResetCount === 0
        ? await window.webContents.executeJavaScript(`Boolean(document.querySelector('.reset-demo-button'))`) as boolean
        : resetControlReady,
      deterministic: expectedResetCount === 0 || (resetSnapshots.length === expectedResetCount && new Set(resetSnapshots).size === 1),
    }
    const initial = await window.webContents.executeJavaScript(`(async () => {
      const [thread] = await window.pmAgent.threads.list();
      const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
      return {
        hasApi: Boolean(window.pmAgent?.threads && window.pmAgent?.chat && window.pmAgent?.lifecycle && window.pmAgent?.demo),
        hasCanvas: Boolean(document.querySelector('.tl-container')),
        hasSeed: workspace.runState.productSpec.requirements.some((item) => item.id === 'REQ-PAYMENT')
      };
    })()`) as { hasApi: boolean; hasCanvas: boolean; hasSeed: boolean }

    const providerSwitch = await window.webContents.executeJavaScript(`(async () => {
      const [beforeThread] = await window.pmAgent.threads.list();
      const beforeWorkspace = await window.pmAgent.lifecycle.getWorkspace(beforeThread.id);
      const select = document.querySelector('select[aria-label="Reasoning provider"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'openai-api');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const paidDialogReady = Boolean(document.querySelector('[aria-label="Confirm paid provider"]'));
      document.querySelector('[aria-label="Confirm paid provider"] .secondary-button')?.click();
      let paidBlocked = false;
      try { await window.pmAgent.threads.setProvider(beforeThread.id, 'openai-api'); }
      catch (error) { paidBlocked = String(error).includes('PAID_PROVIDER_CONFIRMATION_REQUIRED'); }
      const paid = await window.pmAgent.threads.setProvider(beforeThread.id, 'openai-api', true);
      const restored = await window.pmAgent.threads.setProvider(beforeThread.id, 'mock-local');
      const afterWorkspace = await window.pmAgent.lifecycle.getWorkspace(beforeThread.id);
      return {
        paidDialogReady,
        paidBlocked,
        stableThread: paid.id === beforeThread.id && restored.id === beforeThread.id,
        stableSpec: beforeWorkspace.runState.productSpec.id === afterWorkspace.runState.productSpec.id
          && beforeWorkspace.runState.productSpec.version === afterWorkspace.runState.productSpec.version
      };
    })()`) as { paidDialogReady: boolean; paidBlocked: boolean; stableThread: boolean; stableSpec: boolean }

    const slashControl = { menuReady: false, statusRouted: false }
    slashControl.menuReady = await window.webContents.executeJavaScript(`(async () => {
      const input = document.querySelector('.composer textarea');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, '/');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const ready = Boolean(document.querySelector('[aria-label="Slash commands"]')
        && document.body.innerText.includes('/figma status'));
      setter.call(input, '/figma status');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return ready;
    })()`) as boolean
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(100)
      slashControl.statusRouted = await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        const detail = await window.pmAgent.threads.get(thread.id);
        return detail.messages.some((message) => message.role === 'assistant' && message.content.startsWith('Figma status:'))
          && !document.querySelector('.message.pending');
      })()`) as boolean
      if (slashControl.statusRouted) break
    }

    const lifecycleFlow = {
      required: process.env.PM_AGENT_SMOKE_LIFECYCLE === '1',
      blankCanvas: false,
      questions: 0,
      options: 0,
      customAnswerReady: false,
      customDecisionReady: false,
      delivered: false,
      deliveryGuideReady: false,
      transparentMessage: false,
      activityObserved: false,
      prototypeFrames: 0,
      prototypeChildren: 0,
      prototypeReceipt: false,
      manualDirty: false,
      selectionFeedbackReady: false,
      canvasSyncConfirmed: false,
      syncPreservedSpec: false,
      optionsCleared: false,
      resumed: false,
    }
    if (lifecycleFlow.required) {
      await window.webContents.executeJavaScript(`document.querySelector('.new-thread-button')?.click()`)
      await wait(300)
      lifecycleFlow.blankCanvas = await window.webContents.executeJavaScript(`(async () => {
        const active = document.querySelector('.thread-row.active');
        const threadId = active?.getAttribute('data-thread-id');
        if (!threadId || threadId === ${JSON.stringify(DEMO_THREAD_ID)}) return false;
        const thread = await window.pmAgent.threads.get(threadId);
        const workspace = await window.pmAgent.lifecycle.getWorkspace(threadId);
        const canonicalShapes = [...document.querySelectorAll('.tl-shape')]
          .filter((shape) => /REQ-|SCREEN-|STORY-|DEP-/.test(shape.textContent ?? ''));
        return thread.canvasSnapshot === null
          && workspace.runState.phase === 'IDEA_INTAKE'
          && canonicalShapes.length === 0;
      })()`) as boolean
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Kick off Mini App nhắc người dùng backup dữ liệu đúng hạn');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => document.querySelector('.send-button')?.click(), 30);
      })()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        lifecycleFlow.questions = await window.webContents.executeJavaScript(`document.querySelectorAll('.clarification-list fieldset').length`) as number
        if (lifecycleFlow.questions > 0) break
      }
      const clarificationImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-clarification.png'), clarificationImage.toPNG())
      lifecycleFlow.customAnswerReady = await window.webContents.executeJavaScript(`(async () => {
        const fields = [...document.querySelectorAll('.clarification-list fieldset')];
        fields.forEach((fieldset, index) => {
          const buttons = fieldset.querySelectorAll('.segmented-options button');
          buttons[index === 0 ? buttons.length - 1 : 0]?.click();
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const input = fields[0]?.querySelector('.custom-answer-input');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Nhân viên văn phòng có dữ liệu quan trọng trên thiết bị');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        document.querySelector('.phase-continue-button')?.click();
        return Boolean(input);
      })()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        lifecycleFlow.options = await window.webContents.executeJavaScript(`document.querySelectorAll('.decision-options > button').length`) as number
        if (lifecycleFlow.options >= 2) break
      }
      const decisionImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-decision.png'), decisionImage.toPNG())
      lifecycleFlow.customDecisionReady = await window.webContents.executeJavaScript(`(async () => {
        const custom = document.querySelector('.decision-options > button.custom-option');
        custom?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const input = document.querySelector('.custom-decision-input input');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'MVP nhắc backup chủ động và phục hồi khi lỗi');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        document.querySelector('.custom-decision-input .primary-button')?.click();
        return Boolean(custom && input);
      })()`) as boolean
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(250)
        lifecycleFlow.delivered = await window.webContents.executeJavaScript(`(async () => {
          const thread = (await window.pmAgent.threads.list()).find((item) => item.id !== ${JSON.stringify(DEMO_THREAD_ID)});
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          return thread.phase === 'deliver' && workspace.runState.phase === 'DELIVERY' && workspace.runState.status === 'ACTIVE';
        })()`) as boolean
        if (lifecycleFlow.delivered) break
      }
      const deliveryState = await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        const detail = await window.pmAgent.threads.get(thread.id);
        return {
          guide: Boolean(document.querySelector('[aria-label="Delivery next steps"]')),
          transparent: detail.messages.some((message) => message.role === 'user' && message.content.includes('MVP nhắc backup'))
            && detail.messages.some((message) => message.role === 'assistant' && message.content.includes('tổng hợp ProductSpec'))
        };
      })()`) as { guide: boolean; transparent: boolean }
      lifecycleFlow.deliveryGuideReady = deliveryState.guide
      lifecycleFlow.transparentMessage = deliveryState.transparent
      await window.webContents.executeJavaScript(`document.querySelector('.delivery-actions button:nth-child(2)')?.click()`)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(50)
        lifecycleFlow.activityObserved = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.canvas-activity'))`) as boolean
        if (lifecycleFlow.activityObserved) break
      }
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await wait(500)
        const prototypeState = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const detail = await window.pmAgent.threads.get(thread.id);
          const snapshot = JSON.stringify(detail.canvasSnapshot ?? {});
          return {
            frames: (snapshot.match(/\"type\":\"frame\"/g) || []).length,
            children: (snapshot.match(/\"prototypeParentId\"/g) || []).length,
            receipt: detail.messages.some((message) => message.role === 'assistant' && message.content.startsWith('Đã dựng '))
          };
        })()`) as { frames: number; children: number; receipt: boolean }
        lifecycleFlow.prototypeFrames = prototypeState.frames
        lifecycleFlow.prototypeChildren = prototypeState.children
        lifecycleFlow.prototypeReceipt = prototypeState.receipt
        if (prototypeState.frames >= 3 && prototypeState.children >= 15 && prototypeState.receipt) break
      }
      const feedbackTarget = await window.webContents.executeJavaScript(`(() => {
        const shapes = [...document.querySelectorAll('.tl-shape')]
          .filter((shape) => shape.textContent?.includes('DỮ LIỆU MỚI'))
          .map((shape) => ({ shape, rect: shape.getBoundingClientRect() }))
          .sort((first, second) => first.rect.width * first.rect.height - second.rect.width * second.rect.height);
        const target = shapes[0]?.rect;
        return target ? { x: Math.round(target.left + target.width / 2), y: Math.round(target.top + target.height / 2) } : null;
      })()`) as { x: number; y: number } | null
      if (feedbackTarget) {
        const movedTarget = { x: feedbackTarget.x + 18, y: feedbackTarget.y + 8 }
        window.webContents.sendInputEvent({ type: 'mouseDown', x: feedbackTarget.x, y: feedbackTarget.y, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseMove', x: movedTarget.x, y: movedTarget.y, button: 'left' })
        window.webContents.sendInputEvent({ type: 'mouseUp', x: movedTarget.x, y: movedTarget.y, button: 'left', clickCount: 1 })
        await wait(350)
        const manualState = await window.webContents.executeJavaScript(`({
          dirty: Boolean(document.querySelector('.scene-dirty')),
          feedback: Boolean(document.querySelector('.selection-chip button'))
        })`) as { dirty: boolean; feedback: boolean }
        lifecycleFlow.manualDirty = manualState.dirty
        lifecycleFlow.selectionFeedbackReady = manualState.feedback
        await window.webContents.executeJavaScript(`document.querySelector('.scene-sync-button')?.click()`)
        for (let attempt = 0; attempt < 80; attempt += 1) {
          await wait(250)
          const syncState = await window.webContents.executeJavaScript(`(async () => {
            const [thread] = await window.pmAgent.threads.list();
            const detail = await window.pmAgent.threads.get(thread.id);
            const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
            return {
              confirmed: detail.messages.some((message) => message.role === 'assistant' && message.content.includes('Đã đọc canvas')),
              preserved: workspace.runState.productSpec.version === 1 && workspace.runState.productSpec.requirements.length >= 3
            };
          })()`) as { confirmed: boolean; preserved: boolean }
          lifecycleFlow.canvasSyncConfirmed = syncState.confirmed
          lifecycleFlow.syncPreservedSpec = syncState.preserved
          if (syncState.confirmed && syncState.preserved) break
        }
      }
      await wait(2_400)
      const prototypeImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-prototype.png'), prototypeImage.toPNG())
      lifecycleFlow.optionsCleared = await window.webContents.executeJavaScript(`!document.querySelector('.decision-options')`) as boolean
      await window.webContents.executeJavaScript(`document.querySelector('[data-thread-id=${JSON.stringify(DEMO_THREAD_ID)}] .thread-main')?.click()`)
      await wait(350)
      lifecycleFlow.resumed = await window.webContents.executeJavaScript(`document.querySelector('[data-thread-id=${JSON.stringify(DEMO_THREAD_ID)}]')?.classList.contains('active')`) as boolean
    }

    const canvasGesture = {
      required: process.env.PM_AGENT_SMOKE_CANVAS === '1',
      targetFound: false,
      dragPresentationOnly: false,
      undoPresentationOnly: false,
      deletionPresentationOnly: false,
      specUnchanged: false,
      noPreview: false,
      checkpointRecorded: false,
      invalidRejected: false,
    }
    if (canvasGesture.required) {
      const drawTarget = await window.webContents.executeJavaScript(`(() => {
        const stage = document.querySelector('.canvas-stage')?.getBoundingClientRect();
        document.querySelector('.canvas-tool-button[aria-label="Hình khối"]')?.click();
        if (!stage) return null;
        return {
          x1: Math.round(stage.left + stage.width * 0.42),
          y1: Math.round(stage.top + stage.height * 0.42),
          x2: Math.round(stage.left + stage.width * 0.42 + 140),
          y2: Math.round(stage.top + stage.height * 0.42 + 96)
        };
      })()`) as { x1: number; y1: number; x2: number; y2: number } | null
      if (drawTarget) {
        window.webContents.sendInputEvent({ type: 'mouseDown', x: drawTarget.x1, y: drawTarget.y1, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseMove', x: drawTarget.x2, y: drawTarget.y2, button: 'left' })
        window.webContents.sendInputEvent({ type: 'mouseUp', x: drawTarget.x2, y: drawTarget.y2, button: 'left', clickCount: 1 })
      }
      type GestureTarget = { id: string; x: number; y: number; screenX: number; screenY: number }
      let target: GestureTarget | null = null
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(250)
        target = await window.webContents.executeJavaScript(`(async () => {
          const [summary] = await window.pmAgent.threads.list();
          const thread = await window.pmAgent.threads.get(summary.id);
          const records = Object.values(thread.canvasSnapshot?.document?.store ?? {});
          const shape = records.find((record) =>
            record?.typeName === 'shape' && record?.type === 'geo' && record?.meta?.canvasOwner !== 'agent'
          );
          return shape && ${JSON.stringify(drawTarget)}
            ? {
                id: shape.id,
                x: shape.x,
                y: shape.y,
                screenX: Math.round((${drawTarget?.x1 ?? 0} + ${drawTarget?.x2 ?? 0}) / 2),
                screenY: Math.round((${drawTarget?.y1 ?? 0} + ${drawTarget?.y2 ?? 0}) / 2)
              }
            : null;
        })()`) as GestureTarget | null
        if (target) break
      }
      canvasGesture.targetFound = Boolean(target)
      if (target) {
        await window.webContents.executeJavaScript(`document.querySelector('.canvas-tool-button[aria-label="Chọn"]')?.click()`)
        const dragTarget = { x: target.screenX + 48, y: target.screenY + 24 }
        window.webContents.sendInputEvent({ type: 'mouseDown', x: target.screenX, y: target.screenY, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseMove', x: dragTarget.x, y: dragTarget.y, button: 'left' })
        window.webContents.sendInputEvent({ type: 'mouseUp', x: dragTarget.x, y: dragTarget.y, button: 'left', clickCount: 1 })
        await wait(900)
        canvasGesture.dragPresentationOnly = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const detail = await window.pmAgent.threads.get(thread.id);
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          const shape = detail.canvasSnapshot?.document?.store?.[${JSON.stringify(target.id)}];
          const moved = shape && Math.hypot(shape.x - ${target.x}, shape.y - ${target.y}) > 10;
          return Boolean(moved && workspace.runState.productSpec.version === 1 && workspace.preview === null);
        })()`) as boolean
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z', modifiers: ['meta'] })
        await wait(900)
        canvasGesture.undoPresentationOnly = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const detail = await window.pmAgent.threads.get(thread.id);
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          const shape = detail.canvasSnapshot?.document?.store?.[${JSON.stringify(target.id)}];
          return Boolean(shape
            && Math.hypot(shape.x - ${target.x}, shape.y - ${target.y}) <= 1
            && workspace.runState.productSpec.version === 1
            && workspace.preview === null);
        })()`) as boolean
        window.webContents.sendInputEvent({ type: 'mouseDown', x: target.screenX, y: target.screenY, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseUp', x: target.screenX, y: target.screenY, button: 'left', clickCount: 1 })
        await wait(100)
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await wait(100)
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' })
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await wait(250)
          const state = await window.webContents.executeJavaScript(`(async () => {
            const [summary] = await window.pmAgent.threads.list();
            const thread = await window.pmAgent.threads.get(summary.id);
            const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
            const records = Object.values(thread.canvasSnapshot?.document?.store ?? {});
            return {
              deletionPresentationOnly: !document.querySelector('[data-shape-id="${target.id}"]'),
              specUnchanged: workspace.runState.productSpec.version === 1
                && workspace.runState.productSpec.requirements.find((item) => item.id === 'REQ-PAYMENT')?.status === 'in_scope',
              noPreview: workspace.preview === null && workspace.runState.pendingActions.length === 0,
              checkpointRecorded: records.length > 0 && !records.some((record) => record?.id === ${JSON.stringify(target.id)})
            };
          })()`) as Pick<typeof canvasGesture, 'deletionPresentationOnly' | 'specUnchanged' | 'noPreview' | 'checkpointRecorded'>
          Object.assign(canvasGesture, state)
          if (canvasGesture.deletionPresentationOnly && canvasGesture.specUnchanged && canvasGesture.noPreview && canvasGesture.checkpointRecorded) break
        }
      }
      canvasGesture.invalidRejected = await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        try {
          await window.pmAgent.canvas.proposeCommand(thread.id, { schemaVersion: 1, type: 'remove_entity', entityId: 'SCREEN-CHECKOUT' });
          return false;
        } catch (error) {
          return String(error).includes('only supports requirement');
        }
      })()`) as boolean
      const canvasImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-canvas-command.png'), canvasImage.toPNG())
    }

    const ambiguity = {
      required: process.env.PM_AGENT_SMOKE_AMBIGUITY === '1',
      needsInput: false,
      panelReady: false,
      specUnchanged: false,
      noPreview: false,
      noActions: false,
    }
    if (ambiguity.required) {
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Bỏ cái đó');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => document.querySelector('.send-button')?.click(), 30);
      })()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        const state = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          return {
            needsInput: workspace.runState.status === 'NEEDS_USER_INPUT'
              && Boolean(workspace.runState.pendingClarification),
            panelReady: Boolean(document.querySelector('[aria-label="Change clarification required"]')),
            specUnchanged: workspace.runState.productSpec.version === 1,
            noPreview: workspace.preview === null && !document.querySelector('.approve-button'),
            noActions: workspace.runState.pendingActions.length === 0 && workspace.execution === null
          };
        })()`) as Omit<typeof ambiguity, 'required'>
        Object.assign(ambiguity, state)
        if (ambiguity.needsInput && ambiguity.panelReady && ambiguity.specUnchanged && ambiguity.noPreview && ambiguity.noActions) break
      }
      const ambiguityImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-ambiguity.png'), ambiguityImage.toPNG())
    }

    if (process.env.PM_AGENT_SMOKE_PROVIDER) {
      await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        await window.pmAgent.threads.setProvider(thread.id, ${JSON.stringify(process.env.PM_AGENT_SMOKE_PROVIDER)});
      })()`)
    }

    const figmaLive = {
      required: process.env.PM_AGENT_FIGMA_LIVE === '1',
      targetAllowed: false,
      contextReady: false,
      contextMode: '',
      liveReceipt: false,
    }
    if (figmaLive.required) {
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await wait(500)
        const liveStatus = await window.webContents.executeJavaScript(`(async () => {
          const status = await window.pmAgent.figma.start();
          const session = status.sessions.find((item) => item.sessionId === status.activeSession) ?? status.sessions[0];
          return session ? window.pmAgent.figma.allowTarget(session.sessionId) : status;
        })()`)
        figmaLive.targetAllowed = Boolean(liveStatus.target)
        figmaLive.contextReady = Boolean(liveStatus.designSystem)
        figmaLive.contextMode = liveStatus.designSystem?.mode ?? ''
        if (figmaLive.targetAllowed && figmaLive.contextReady) break
      }
    }

    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.composer textarea');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, 'Bỏ payment khỏi MVP');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => document.querySelector('.send-button')?.click(), 50);
    })()`)
    let final = { hasPreview: false, hasError: false, messageCount: 0, pending: true }
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(500)
      final = await window.webContents.executeJavaScript(`({
        hasPreview: Boolean(document.querySelector('.change-preview') && document.querySelector('.approve-button')),
        hasError: Boolean(document.querySelector('.error-banner')),
        messageCount: document.querySelectorAll('.message').length,
        pending: Boolean(document.querySelector('.message.pending'))
      })`) as typeof final
      if (final.hasError || (!final.pending && final.hasPreview)) break
    }
    const previewImage = await window.webContents.capturePage()
    writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-preview.png'), previewImage.toPNG())
    const rejection = { required: process.env.PM_AGENT_SMOKE_REJECT === '1', rejected: false, preservedVersion: false, noExecution: false, previewedAgain: false }
    if (rejection.required && final.hasPreview) {
      await window.webContents.executeJavaScript(`document.querySelector('.reject-button')?.click()`)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(250)
        const state = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          return {
            rejected: document.body.innerText.includes('Đã từ chối change plan'),
            preservedVersion: workspace.runState.productSpec.version === 1,
            noExecution: workspace.execution === null
          };
        })()`) as Pick<typeof rejection, 'rejected' | 'preservedVersion' | 'noExecution'>
        Object.assign(rejection, state)
        if (rejection.rejected && rejection.preservedVersion && rejection.noExecution) break
      }
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Bỏ payment khỏi MVP');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => document.querySelector('.send-button')?.click(), 30);
      })()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        rejection.previewedAgain = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.change-preview') && document.querySelector('.approve-button'))`) as boolean
        if (rejection.previewedAgain) break
      }
    }
    if (final.hasPreview) {
      await window.webContents.executeJavaScript(`document.querySelector('.approve-button')?.click()`)
    }
    let approval = {
      committed: false,
      specVersion: 0,
      paymentStatus: '',
      actionsApproved: false,
      executionVerified: false,
      executionStatus: '',
      verifiedTargets: [] as string[],
      failedTargets: [] as string[],
      attempts: {} as Record<string, number>,
      externalIds: {} as Record<string, string>,
      executionPanelReady: false,
      documentReady: false,
    }
    const providerNeedsDesignTime = process.env.PM_AGENT_SMOKE_PROVIDER && process.env.PM_AGENT_SMOKE_PROVIDER !== 'mock-local'
    const approvalAttempts = figmaLive.required
      ? 8_000
      : providerNeedsDesignTime
        ? 2_400
        : 60
    for (let attempt = 0; attempt < approvalAttempts; attempt += 1) {
      await wait(250)
      approval = await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
        return {
          committed: document.body.innerText.includes('Đã duyệt ProductSpec v2'),
          specVersion: workspace.runState.productSpec.version,
          paymentStatus: workspace.runState.productSpec.requirements.find((item) => item.id === 'REQ-PAYMENT')?.status ?? '',
          actionsApproved: workspace.runState.pendingActions.every((action) => action.status === 'approved'),
          executionVerified: workspace.execution?.status === 'verified',
          executionStatus: workspace.execution?.status ?? '',
          verifiedTargets: workspace.execution?.actions
            .filter((action) => action.status === 'verified')
            .map((action) => action.target)
            .sort() ?? [],
          failedTargets: workspace.execution?.actions
            .filter((action) => action.status === 'failed' || action.status === 'verification_failed')
            .map((action) => action.target)
            .sort() ?? [],
          attempts: Object.fromEntries(workspace.execution?.actions.map((action) => [action.target, action.attempts]) ?? []),
          externalIds: Object.fromEntries(workspace.execution?.actions
            .filter((action) => action.receipt)
            .map((action) => [action.target, action.receipt.externalId]) ?? []),
          executionPanelReady: ['figma', 'jira', 'zdoc']
            .every((target) => Boolean(document.querySelector('.execution-panel [data-target="' + target + '"]')))
        };
      })()`) as typeof approval
      const expectedExecutionState = expectedFailureTarget
        ? approval.executionStatus === 'partial_failure' && approval.failedTargets.includes(expectedFailureTarget)
        : approval.executionVerified
      if (approval.committed && expectedExecutionState && approval.executionPanelReady) break
    }
    approval.documentReady = existsSync(markdownArtifactPath(workspaceFor(history.listThreads()[0]!.id).runState.productSpec))
    figmaLive.liveReceipt = Boolean(approval.externalIds.figma && !approval.externalIds.figma.startsWith('MOCK-FIGMA-'))
    const beforeRetry = structuredClone(approval)
    let recovery = { attempted: false, verified: !expectedFailureTarget, preservedTargets: !expectedFailureTarget }
    if (expectedFailureTarget) {
      const failureImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-partial-failure.png'), failureImage.toPNG())
      const retryClicked = await window.webContents.executeJavaScript(`(() => {
        const button = document.querySelector(
          '.execution-panel button[data-retry-target="${expectedFailureTarget}"]'
        );
        button?.click();
        return Boolean(button);
      })()`) as boolean
      recovery.attempted = retryClicked
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await wait(250)
        approval = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          return {
            committed: document.body.innerText.includes('Retry hoàn tất'),
            specVersion: workspace.runState.productSpec.version,
            paymentStatus: workspace.runState.productSpec.requirements.find((item) => item.id === 'REQ-PAYMENT')?.status ?? '',
            actionsApproved: workspace.runState.pendingActions.every((action) => action.status === 'approved'),
            executionVerified: workspace.execution?.status === 'verified',
            executionStatus: workspace.execution?.status ?? '',
            verifiedTargets: workspace.execution?.actions.filter((action) => action.status === 'verified').map((action) => action.target).sort() ?? [],
            failedTargets: workspace.execution?.actions.filter((action) => action.status === 'failed' || action.status === 'verification_failed').map((action) => action.target).sort() ?? [],
            attempts: Object.fromEntries(workspace.execution?.actions.map((action) => [action.target, action.attempts]) ?? []),
            externalIds: Object.fromEntries(workspace.execution?.actions.filter((action) => action.receipt).map((action) => [action.target, action.receipt.externalId]) ?? []),
            executionPanelReady: ['figma', 'jira', 'zdoc']
              .every((target) => Boolean(document.querySelector('.execution-panel [data-target="' + target + '"]')))
          };
        })()`) as typeof approval
        if (approval.executionVerified && approval.committed) break
      }
      const preservedTargets = ['figma', 'jira', 'zdoc'].filter((target) => target !== expectedFailureTarget)
      recovery = {
        attempted: retryClicked,
        verified: approval.executionVerified,
        preservedTargets: preservedTargets.every((target) =>
          beforeRetry.attempts[target] === approval.attempts[target]
          && beforeRetry.externalIds[target] === approval.externalIds[target]),
      }
      approval.documentReady = existsSync(markdownArtifactPath(workspaceFor(history.listThreads()[0]!.id).runState.productSpec))
    }
    const semanticFlow = {
      required: process.env.PM_AGENT_SMOKE_FLOW === '1',
      blankAfterKickoff: false,
      kickoffConfirmed: false,
      nodes: 0,
      edges: 0,
      infiniteCanvas: false,
      providerProgram: false,
      receiptConfirmed: false,
      ambiguousEditBlocked: false,
      feedbackApplied: false,
      feedbackReceiptConfirmed: false,
      feedbackProgramSource: '',
      feedbackOperations: 0,
      promotionPreview: false,
      promoted: false,
      scriptApplied: false,
      artifactVerified: false,
    }
    if (semanticFlow.required) {
      await window.webContents.executeJavaScript(`document.querySelector('.new-thread-button')?.click()`)
      await wait(600)
      const semanticThreadId = await window.webContents.executeJavaScript(
        `document.querySelector('.thread-row.active')?.getAttribute('data-thread-id')`,
      ) as string
      if (process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER) {
        await window.webContents.executeJavaScript(`(async () => {
          await window.pmAgent.threads.setProvider(${JSON.stringify(semanticThreadId)}, ${JSON.stringify(process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER)});
        })()`)
      }
      console.log('[smoke-stage] semantic conversation')
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Tôi muốn làm Mini App nhắc người dùng backup dữ liệu đúng hạn');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`)
      for (let attempt = 0; attempt < 280; attempt += 1) {
        await wait(500)
        const kickoffDetail = history.getThread(semanticThreadId)
        const kickoffSnapshot = JSON.stringify(kickoffDetail.canvasSnapshot ?? {})
        const kickoff = {
          blank: (kickoffSnapshot.match(/"nodeKind"/g) || []).length === 0,
          confirmed: kickoffDetail.messages.some((message) => message.role === 'assistant'),
        }
        semanticFlow.blankAfterKickoff = kickoff.blank
        semanticFlow.kickoffConfirmed = kickoff.confirmed
        if (kickoff.blank && kickoff.confirmed) break
      }
      for (let attempt = 0; attempt < 100 && activeRuns.has(semanticThreadId); attempt += 1) await wait(50)
      console.log('[smoke-stage] semantic draw')
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Vẽ toàn bộ user flow cho ý tưởng remind backup');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`)
      const naturalCreativeWaitAttempts = process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER ? 600 : 280
      for (let attempt = 0; attempt < naturalCreativeWaitAttempts; attempt += 1) {
        await wait(500)
        const flowDetail = history.getThread(semanticThreadId)
        const flowSnapshot = JSON.stringify(flowDetail.canvasSnapshot ?? {})
        const canvasUiState = await window.webContents.executeJavaScript(`({
          infiniteCanvas: !document.querySelector('.view-tabs') && Boolean(document.querySelector('.tl-container')),
          providerProgram: ['provider', 'provider_augmented'].includes(document.querySelector('.canvas-workspace')?.getAttribute('data-program-source') ?? '')
        })`) as { infiniteCanvas: boolean; providerProgram: boolean }
        const state = {
          nodes: (flowSnapshot.match(/"nodeKind"/g) || []).length,
          edges: (flowSnapshot.match(/"type":"arrow"/g) || []).length,
          receiptConfirmed: flowDetail.messages.some((message) => message.role === 'assistant' && message.content.startsWith('Đã dựng flow')),
          ...canvasUiState,
        }
        Object.assign(semanticFlow, state)
        if (semanticFlow.nodes >= 14 && semanticFlow.edges >= 14 && semanticFlow.infiniteCanvas && semanticFlow.receiptConfirmed) break
      }
      for (let attempt = 0; attempt < 100 && activeRuns.has(semanticThreadId); attempt += 1) await wait(50)
      const beforeAmbiguous = { nodes: semanticFlow.nodes, edges: semanticFlow.edges }
      console.log(`[smoke-stage] semantic ambiguous edit lock=${activeRuns.has(semanticThreadId)}`)
      await window.webContents.executeJavaScript(`window.pmAgent.chat.send({
        threadId: ${JSON.stringify(semanticThreadId)},
        content: 'Sửa canvas nhưng chưa chọn target'
      })`)
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await wait(500)
        const ambiguousDetail = history.getThread(semanticThreadId)
        const ambiguousSnapshot = JSON.stringify(ambiguousDetail.canvasSnapshot ?? {})
        semanticFlow.ambiguousEditBlocked = ambiguousDetail.messages.some((message) =>
          message.role === 'assistant' && message.content.includes('Hãy chọn một hoặc nhiều node'))
          && (ambiguousSnapshot.match(/"nodeKind"/g) || []).length === beforeAmbiguous.nodes
          && (ambiguousSnapshot.match(/"type":"arrow"/g) || []).length === beforeAmbiguous.edges
        if (semanticFlow.ambiguousEditBlocked) break
      }
      for (let attempt = 0; attempt < 100 && activeRuns.has(semanticThreadId); attempt += 1) await wait(50)
      console.log('[smoke-stage] semantic selected edit')
      const feedback = await window.webContents.executeJavaScript(`(async () => {
        const detail = await window.pmAgent.threads.get(${JSON.stringify(semanticThreadId)});
        const store = detail.canvasSnapshot?.document?.store ?? {};
        const target = Object.values(store).find((shape) =>
          shape?.typeName === 'shape' && shape?.meta?.semanticId && shape?.meta?.nodeKind === 'decision'
        ) ?? Object.values(store).find((shape) =>
          shape?.typeName === 'shape' && shape?.meta?.semanticId && shape?.meta?.nodeKind
        );
        if (!target) throw new Error('Smoke không tìm thấy semantic node để feedback');
        const semanticId = target.meta.semanticId;
        const label = target.meta.label || target.props?.name || semanticId;
        return window.pmAgent.chat.send({
          threadId: ${JSON.stringify(semanticThreadId)},
          content: 'Thêm retry và nhánh lỗi vào bước đang chọn',
          selection: { entityId: semanticId, label, selectedShapeCount: 1, shapeIds: [target.id] },
          canvas: {
            schemaVersion: 1,
            revision: 2,
            selectedShapeIds: [target.id],
            shapes: [{
              id: target.id,
              semanticId,
              type: target.type,
              label,
              nodeKind: target.meta.nodeKind,
              x: target.x,
              y: target.y,
              width: target.props?.w ?? 300,
              height: target.props?.h ?? 220
            }]
          }
        });
      })()`) as {
        canvasProgram: import('@pm-agent/domain').CanvasProgram
        canvasProgramSource: 'provider' | 'provider_augmented' | 'deterministic_fallback' | 'none'
        canvasRequestId: string | null
      }
      const feedbackThreadId = semanticThreadId
      const feedbackNodeIds = feedback.canvasProgram.operations
        .filter((operation) => operation.op === 'create_node')
        .map((operation) => operation.id)
      semanticFlow.feedbackProgramSource = feedback.canvasProgramSource
      semanticFlow.feedbackOperations = feedback.canvasProgram.operations.length
      window.webContents.send('canvas:external-program', {
        threadId: feedbackThreadId,
        batchId: Date.now(),
        ...(feedback.canvasRequestId ? { requestId: feedback.canvasRequestId } : {}),
        source: feedback.canvasProgramSource === 'none' ? 'provider' : feedback.canvasProgramSource,
        program: feedback.canvasProgram,
      })
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        const detail = history.getThread(feedbackThreadId)
        const snapshot = JSON.stringify(detail.canvasSnapshot ?? {})
        semanticFlow.feedbackApplied = feedbackNodeIds.length > 0 && feedbackNodeIds.every((id) => snapshot.includes(id))
        semanticFlow.feedbackReceiptConfirmed = detail.messages.some((message) => message.role === 'assistant' && message.content.startsWith('Đã cập nhật vùng canvas đã chọn'))
        if (semanticFlow.feedbackApplied && semanticFlow.feedbackReceiptConfirmed) break
      }
      const flowImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-canvas-flow.png'), flowImage.toPNG())
      console.log('[smoke-stage] semantic promote')
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Chốt flow này thành MVP');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`)
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await wait(500)
        semanticFlow.promotionPreview = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[aria-label="ProductSpec promotion preview"]'))`) as boolean
        if (semanticFlow.promotionPreview) break
      }
      await window.webContents.executeJavaScript(`document.querySelector('[aria-label="ProductSpec promotion preview"] .primary-button')?.click()`)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(250)
        semanticFlow.promoted = await window.webContents.executeJavaScript(`(async () => {
          const workspace = await window.pmAgent.lifecycle.getWorkspace(${JSON.stringify(semanticThreadId)});
          return workspace.runState.phase === 'DELIVERY' && workspace.runState.productSpec.version === 2
            && workspace.runState.productSpec.requirements.length >= 3;
        })()`) as boolean
        if (semanticFlow.promoted) break
      }
      const activeThreadId = semanticThreadId
      window.webContents.send('canvas:external-program', {
        threadId: activeThreadId,
        batchId: Date.now(),
        source: 'developer',
        program: { schemaVersion: 1, mode: 'script', summary: 'Developer skill smoke', operations: [], script: "canvas.node('dev-checkpoint', 'Dev checkpoint', 'note', {\"x\":1600,\"y\":660})" },
      })
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(250)
        semanticFlow.scriptApplied = JSON.stringify(history.getThread(activeThreadId).canvasSnapshot ?? {}).includes('Dev checkpoint')
        if (semanticFlow.scriptApplied) break
      }
      await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Artifact plan approval"] .primary-button')?.click()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        semanticFlow.artifactVerified = workspaceFor(activeThreadId).execution?.status === 'verified'
        if (semanticFlow.artifactVerified) break
      }
    }

    await window.webContents.executeJavaScript(`document.querySelector('.integration-button')?.click()`)
    await wait(500)
    const figmaSetup = await window.webContents.executeJavaScript(`(async () => {
      const status = await window.pmAgent.figma.status();
      return {
        hasSetupDialog: Boolean(document.querySelector('.figma-setup-dialog')),
        runtimeReady: status.runtime === 'ready',
        pluginBuilt: status.pluginBuilt === true,
        waitingForPlugin: document.querySelector('.figma-setup-dialog')?.innerText.includes('Import vào Figma Desktop')
          || document.querySelector('.figma-setup-dialog')?.innerText.includes('Figma đã kết nối')
      };
    })()`) as { hasSetupDialog: boolean; runtimeReady: boolean; pluginBuilt: boolean; waitingForPlugin: boolean }
    if (figmaLive.required) {
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await wait(500)
        const liveStatus = await window.webContents.executeJavaScript(`window.pmAgent.figma.status()`)
        figmaLive.targetAllowed = Boolean(liveStatus.target)
        figmaLive.contextReady = Boolean(liveStatus.designSystem)
        figmaLive.contextMode = liveStatus.designSystem?.mode ?? ''
        if (figmaLive.targetAllowed && figmaLive.contextReady) break
      }
    }
    const figmaSetupImage = await window.webContents.capturePage()
    writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-figma-setup.png'), figmaSetupImage.toPNG())
    await window.webContents.executeJavaScript(`document.querySelector('.figma-setup-dialog > header .icon-button')?.click()`)
    const image = await window.webContents.capturePage()
    writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!, image.toPNG())
    const passed = initial.hasApi && initial.hasCanvas && initial.hasSeed
      && reset.controlReady && reset.deterministic
      && providerSwitch.paidDialogReady && providerSwitch.paidBlocked && providerSwitch.stableThread && providerSwitch.stableSpec
      && slashControl.menuReady && slashControl.statusRouted
      && (!lifecycleFlow.required || (lifecycleFlow.blankCanvas && lifecycleFlow.questions > 0 && lifecycleFlow.questions <= 3
        && lifecycleFlow.options >= 3 && lifecycleFlow.options <= 4
        && lifecycleFlow.customAnswerReady && lifecycleFlow.customDecisionReady && lifecycleFlow.delivered
        && lifecycleFlow.deliveryGuideReady && lifecycleFlow.transparentMessage && lifecycleFlow.activityObserved
        && lifecycleFlow.prototypeFrames >= 3 && lifecycleFlow.prototypeChildren >= 15 && lifecycleFlow.prototypeReceipt
        && lifecycleFlow.manualDirty && lifecycleFlow.selectionFeedbackReady
        && lifecycleFlow.canvasSyncConfirmed && lifecycleFlow.syncPreservedSpec
        && lifecycleFlow.optionsCleared && lifecycleFlow.resumed))
      && (!rejection.required || (rejection.rejected && rejection.preservedVersion && rejection.noExecution && rejection.previewedAgain))
      && (!canvasGesture.required || (canvasGesture.targetFound && canvasGesture.dragPresentationOnly && canvasGesture.undoPresentationOnly
        && canvasGesture.deletionPresentationOnly && canvasGesture.specUnchanged
        && canvasGesture.noPreview && canvasGesture.checkpointRecorded && canvasGesture.invalidRejected))
      && (!ambiguity.required || (ambiguity.needsInput && ambiguity.panelReady && ambiguity.specUnchanged
        && ambiguity.noPreview && ambiguity.noActions))
      && (!semanticFlow.required || (semanticFlow.blankAfterKickoff && semanticFlow.kickoffConfirmed
        && semanticFlow.nodes >= 14 && semanticFlow.edges >= 14 && semanticFlow.infiniteCanvas && semanticFlow.receiptConfirmed
        && semanticFlow.ambiguousEditBlocked && semanticFlow.feedbackApplied && semanticFlow.feedbackReceiptConfirmed
        && semanticFlow.promotionPreview && semanticFlow.promoted && semanticFlow.scriptApplied && semanticFlow.artifactVerified
        && (!process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER || semanticFlow.providerProgram)))
      && final.hasPreview && !final.pending && !final.hasError
      && approval.committed && approval.specVersion === 2
      && approval.paymentStatus === 'removed' && approval.actionsApproved
      && approval.executionVerified && approval.executionPanelReady && approval.documentReady
      && approval.verifiedTargets.join(',') === 'figma,jira,zdoc'
      && recovery.attempted === Boolean(expectedFailureTarget)
      && recovery.verified && recovery.preservedTargets
      && figmaSetup.hasSetupDialog && figmaSetup.runtimeReady && figmaSetup.pluginBuilt && figmaSetup.waitingForPlugin
      && (!figmaLive.required || (figmaLive.targetAllowed && figmaLive.contextReady && figmaLive.liveReceipt))
    console.log(`[smoke] ${JSON.stringify({ passed, reset, providerSwitch, slashControl, lifecycleFlow, rejection, canvasGesture, ambiguity, semanticFlow, ...initial, ...final, ...approval, expectedFailureTarget, recovery, ...figmaSetup, ...figmaLive, screenshot: process.env.PM_AGENT_SMOKE_CAPTURE })}`)
    app.exit(passed ? 0 : 1)
  } catch (error) {
    console.error('[smoke] failed', error)
    app.exit(1)
  }
}

app.whenReady().then(() => {
  const databasePath = join(app.getPath('userData'), 'pm-lifecycle-agent.sqlite')
  const figmaPaths = figmaRuntimePaths()
  history = new HistoryStore(databasePath)
  lifecycle = new LifecycleStore(databasePath)
  outbox = new OutboxStore(databasePath)
  mockFigmaStore = new SqliteMockArtifactStore(databasePath)
  mockJira = new MockJiraConnector(new SqliteMockArtifactStore(databasePath), timestamp)
  mockZdoc = new MockZdocConnector(new SqliteMockArtifactStore(databasePath), timestamp)
  if (process.env.PM_AGENT_SMOKE_FAIL_TARGET === 'jira') mockJira.failNextExecute()
  if (process.env.PM_AGENT_SMOKE_FAIL_TARGET === 'zdoc') mockZdoc.failNextExecute()
  figmaIntegration = new FigmaIntegrationStore(databasePath)
  figmaRuntime = new FigmaRuntimeManager(figmaPaths)
  figmaMcp = new FigmaMcpAdapter({ binaryPath: figmaPaths.binaryPath })
  secrets = new SecretStore(join(app.getPath('userData'), 'provider-secrets.json'))
  if (process.env.PM_AGENT_RESET_ON_START === '1') resetDemoWorkspace()
  registerIpc()
  createWindow()
  canvasBridge = new CanvasBridge({
    homePath: app.getPath('home'),
    listThreads: () => history.listThreads(),
    getThread: (threadId) => history.getThread(threadId),
    dispatch: (threadId, commands) => mainWindow?.webContents.send('canvas:external-commands', { threadId, batchId: Date.now(), commands }),
    dispatchProgram: (threadId, batchId, program) => mainWindow?.webContents.send('canvas:external-program', { threadId, batchId, program, source: 'developer' }),
    runScript: (source) => runCanvasScriptVm(source),
  })
  void canvasBridge.start().catch((error) => console.error('[canvas-bridge] failed to start', error))
  try {
    canvasSkillInstall = installCanvasSkill(skillPackRuntimeRoots(), app.getPath('home'))
    console.log(`[skill-installer] pm-lifecycle-canvas ${canvasSkillInstall.status} at ${canvasSkillInstall.skillDir}${canvasSkillInstall.reason ? ` (${canvasSkillInstall.reason})` : ''}`)
  } catch (error) {
    console.error('[skill-installer] failed to install canvas skill', error)
  }
  void figmaRuntime.start()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  activeRuns.forEach((controller) => controller.abort())
  void figmaMcp?.close()
  figmaRuntime?.stop()
  canvasBridge?.stop()
  figmaIntegration?.close()
  mockZdoc?.close()
  mockJira?.close()
  mockFigmaStore?.close()
  outbox?.close()
  lifecycle?.close()
  history?.close()
})
