import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import { acceptCompletedProviderEvents, advanceReasoningPhase, approveActions, assertProviderSwitchAllowed, changeIntentFromCanvasCommand, createHandoffPackage, createImpactPreview, customDecisionOptionId, executeConnectorAction, normalizeClarificationAnswers, rejectActions, resolveRemovalChangeIntent, selectDecisionOption, synthesizeProductSpecFromDecision } from '@pm-agent/agent-core'
import { canvasProgramCovers, classifyCanvasInteraction, legacyCommandsToCanvasProgram, planExplicitCanvasRequest, synthesizeProductSpecFromCanvas } from '@pm-agent/canvas'
import {
  createFixtureFallbackDesignSystemContext,
  createFigmaArtifactPlan,
  createLivePrimitiveFallbackManifest,
  createMockJiraPlan,
  createMockZdocPlan,
  FigmaMcpAdapter,
  FigmaMcpArtifactConnector,
  FigmaRuntimeManager,
  hashConnectorPayload,
  MockFigmaArtifactConnector,
  MockJiraConnector,
  MockZdocConnector,
  normalizeFigmaDesignSystemContext,
  renderProductSpecMarkdown,
  SqliteMockArtifactStore,
} from '@pm-agent/connectors'
import type {
  ChangeIntent,
  CanvasGestureCommand,
  CanvasExecutionFailure,
  CanvasExecutionReceipt,
  CanvasDocumentContext,
  CanvasProgram,
  CanvasPromotionPreview,
  ConfigureProviderInput,
  DesktopApi,
  LifecycleWorkspaceState,
  ProviderProfile,
  SendChatInput,
  PlannedAction,
  ProductSpec,
} from '@pm-agent/domain'
import {
  createDraftProductSpec,
  designSystemManifestSchema,
  figmaArtifactPlanSchema,
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
import { ProviderRegistry } from '@pm-agent/reasoning'
import { SecretStore } from './secret-store'
import { CanvasBridge } from './canvas-bridge'

const { app, BrowserWindow, ipcMain, shell } = electron

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
const providers = new ProviderRegistry()
const activeRuns = new Map<string, AbortController>()
const promotionPreviews = new Map<string, CanvasPromotionPreview>()
const pendingCanvasExecutions = new Map<string, {
  threadId: string
  program: CanvasProgram
  kind: 'draw' | 'edit'
}>()

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

function normalizeIntentText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim()
}

function deliveryStatusMessage(productSpec: ProductSpec, selectedOption?: string): string {
  const requirements = productSpec.requirements.filter((item) => item.status !== 'removed').length
  const prefix = selectedOption ? `Đã khóa phương án “${selectedOption}”. ` : ''
  return `${prefix}Đã tổng hợp ProductSpec v${productSpec.version} từ chính cuộc hội thoại: ${requirements} requirement, ${productSpec.screens.length} screen, ${productSpec.stories.length} story. Bước tiếp theo: review flow/prototype trên canvas hoặc tạo kickoff package gồm Figma, PRD.md và backlog mock.`
}

function canvasReceiptMessage(program: CanvasProgram, receipt: CanvasExecutionReceipt, kind: 'draw' | 'edit'): string {
  const nodes = program.operations.filter((operation) => operation.op === 'create_node').length
  const connections = program.operations.filter((operation) => operation.op === 'connect').length
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
  if (/prototype low-fidelity/i.test(program.summary)) {
    return `Đã dựng ${nodes} màn hình prototype low-fidelity và ${connections} chuyển tiếp. Bạn có thể kéo cả frame, sửa từng thành phần, hoặc chọn một màn hình rồi chat để feedback. Canvas đã đọc lại thành công ${receipt.shapeCount} phần tử.`
  }
  return `Đã vẽ ${nodes} node và ${connections} kết nối. Canvas đã đọc lại thành công ${receipt.shapeCount} phần tử.`
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
  planMode: 'strict' | 'free'
}

function figmaExecutionContext(): FigmaExecutionContext {
  const target = figmaIntegration.getActiveTarget()
  const context = target ? figmaIntegration.getContext(target.targetHash) : null
  if (target && context) {
    return context.mode === 'live'
      ? { target, manifest: context.manifest, connectorMode: 'live', planMode: 'strict' }
      : {
          target,
          manifest: createLivePrimitiveFallbackManifest(context.manifest),
          connectorMode: 'live',
          planMode: 'free',
        }
  }
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
    planMode: 'strict',
  }
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

async function prepareExecutableActions(state: RunState, spec: ProductSpec): Promise<PlannedAction[]> {
  const figmaAction = state.pendingActions.find((action) => action.target === 'figma')
  const jiraAction = state.pendingActions.find((action) => action.target === 'jira')
  const zdocAction = state.pendingActions.find((action) => action.target === 'zdoc')
  if (!figmaAction || !jiraAction || !zdocAction) throw new Error('Change plan must contain Figma, Jira and Zdoc actions')
  const figmaContext = figmaExecutionContext()
  const figmaPlan = createFigmaArtifactPlan(spec, figmaContext.target, figmaContext.manifest, {
    runId: state.id,
    threadId: state.threadId,
    actionId: figmaAction.id,
    idempotencyKey: `figma:${state.id}:spec-v${spec.version}:recipe-v2`,
  }, figmaContext.planMode)
  const figmaConnector = figmaContext.connectorMode === 'live'
    ? new FigmaMcpArtifactConnector(figmaMcp, figmaContext.manifest, figmaContext.target)
    : new MockFigmaArtifactConnector(figmaContext.manifest, figmaContext.target, { store: mockFigmaStore })
  const [figmaPreflight, jiraPreflight, zdocPreflight] = await Promise.all([
    figmaConnector.preflight(figmaPlan),
    mockJira.preflight(createMockJiraPlan(spec, {
      runId: state.id, threadId: state.threadId, actionId: jiraAction.id, idempotencyKey: `jira:${state.id}:v${spec.version}`,
    })),
    mockZdoc.preflight(createMockZdocPlan(spec, {
      runId: state.id, threadId: state.threadId, actionId: zdocAction.id, idempotencyKey: `zdoc:${state.id}:v${spec.version}`,
    })),
  ])
  if (!figmaPreflight.allowed || !jiraPreflight.allowed || !zdocPreflight.allowed) throw new Error('Artifact preflight contains blocking issues')

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
    }),
    executable(jiraAction, 'mock_jira_plan', jiraPreflight.planHash, jiraPreflight.plan),
    executable(zdocAction, 'mock_zdoc_plan', zdocPreflight.planHash, zdocPreflight.plan),
  ]
}

async function executeRun(threadId: string, target?: PlannedAction['target']): Promise<LifecycleWorkspaceState> {
  let state = lifecycle.getRunState(threadId)
  if (!state) throw new Error('Lifecycle run does not exist')
  if (state.status === 'PARTIAL_FAILURE') state = transitionRunState(state, 'RETRY_EXECUTION', timestamp())
  else if (state.status === 'ACTIVE') state = transitionRunState(state, 'START_EXECUTION', timestamp())
  else if (state.status !== 'EXECUTING') return workspaceFor(threadId)
  lifecycle.saveRunState(state)

  const work = outbox.listRun(state.id).filter((item) => !target || item.action.target === target)
  await Promise.all(work.map(async (item) => {
    const payload = item.action.payload
    if (item.action.target === 'figma') {
      const plan = figmaArtifactPlanSchema.parse(payload.plan)
      const manifest = designSystemManifestSchema.parse(payload.manifest)
      const connector = payload.connectorMode === 'live'
        ? new FigmaMcpArtifactConnector(figmaMcp, manifest, plan.target)
        : new MockFigmaArtifactConnector(manifest, plan.target, { store: mockFigmaStore })
      await executeConnectorAction({ action: item.action, plan, connector, repository: outbox })
    } else if (item.action.target === 'jira') {
      await executeConnectorAction({ action: item.action, plan: mockJiraPlanSchema.parse(payload.plan), connector: mockJira, repository: outbox })
    } else {
      await executeConnectorAction({ action: item.action, plan: mockZdocPlanSchema.parse(payload.plan), connector: mockZdoc, repository: outbox })
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
  return workspaceFor(threadId)
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
  const target = storedTarget && runtime.sessions.some((session) => (
    session.sessionId === storedTarget.sessionId
    && session.fileName === storedTarget.fileName
    && session.pageName === storedTarget.pageName
  )) ? storedTarget : null
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
  const activeTarget = figmaIntegration.getActiveTarget()
  const allowedAt = activeTarget?.sessionId === sessionId && activeTarget.pageId === pages.currentPageId
    ? activeTarget.allowedAt
    : timestamp()
  const target = await figmaMcp.pinTarget(sessionId, pages.currentPageId, allowedAt)
  figmaIntegration.saveActiveTarget(target)

  const cached = forceCapture ? null : figmaIntegration.getContext(target.targetHash)
  if (!cached) {
    try {
      const capture = await figmaMcp.captureDesignSystem(target)
      figmaIntegration.saveContext(normalizeFigmaDesignSystemContext(capture, target, syntheticZaloDesignSystem, timestamp()))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown live capture error'
      figmaIntegration.saveContext(createFixtureFallbackDesignSystemContext(
        target,
        syntheticZaloDesignSystem,
        `Không thể hoàn tất live component-map capture trong ngân sách demo (${detail}); dùng synthetic fixture guard có nhãn.`,
        timestamp(),
      ))
    }
  }
  return figmaStatus()
}

function registerIpc(): void {
  ipcMain.handle('threads:list', (_event, query?: string) => history.listThreads(query))
  ipcMain.handle('threads:create', () => history.createThread())
  ipcMain.handle('threads:get', (_event, threadId: string) => history.getThread(threadId))
  ipcMain.handle('threads:messages', (_event, threadId: string, cursor?: string, limit?: number) => history.listMessagesPage(threadId, cursor, limit))
  ipcMain.handle('threads:archive', (_event, threadId: string) => history.archiveThread(threadId))
  ipcMain.handle('threads:set-provider', (_event, threadId: string, profileId: string, confirmPaid = false) => {
    const thread = history.getThread(threadId)
    if (thread.providerId === profileId) return thread
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
    return history.switchThreadProvider(threadId, profile.id, providers.get(profile.providerId).capabilities, handoff)
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
    const workspace = workspaceFor(threadId)
    const state = workspace.runState
    if (state.phase !== 'DELIVERY' || state.status !== 'ACTIVE') {
      throw new Error('Kickoff package chỉ có thể chuẩn bị tại Delivery checkpoint')
    }
    if (state.productSpec.requirements.length === 0) throw new Error('ProductSpec chưa có scope để tạo kickoff package')
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
    history.addMessage(threadId, 'assistant', 'Kickoff package đã preflight: Figma guard, PRD Markdown và backlog mock. Hãy kiểm tra target rồi duyệt tạo.')
    return workspaceFor(threadId)
  })
  ipcMain.handle('lifecycle:approve-artifacts', async (_event, threadId: string) => {
    const state = workspaceFor(threadId).runState
    if (state.status !== 'WAITING_FOR_APPROVAL' || state.pendingIntent || state.pendingActions.length === 0) {
      throw new Error('Không có artifact plan đang chờ duyệt')
    }
    const at = timestamp()
    const approved = approveActions(state.pendingActions, at)
    const approvedState = transitionRunState({ ...state, pendingActions: approved.actions }, 'APPROVE', at)
    lifecycle.commitApprovedChange(approvedState, approved.approvals)
    const executed = await executeRun(threadId)
    const message = executed.execution?.status === 'verified'
      ? `Kickoff package đã verified: Figma, backlog mock và PRD Markdown tại ${markdownArtifactPath(executed.runState.productSpec)}.`
      : 'Artifact execution chưa hoàn tất; xem trạng thái từng target để retry.'
    history.addMessage(threadId, 'assistant', message)
    return { ...executed, message }
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
    const message = executed.execution?.status === 'verified'
      ? `Đã duyệt ProductSpec v${preview.after.version} và read-back verified cả Figma, Mock Jira, Mock Zdoc.`
      : `Đã duyệt ProductSpec v${preview.after.version}; một số artifact cần retry sau khi connector sẵn sàng.`
    history.addMessage(threadId, 'assistant', message)
    return { ...executed, message }
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
    const workspace = await executeRun(threadId, target)
    const message = workspace.execution?.status === 'verified'
      ? 'Retry hoàn tất; mọi artifact đã được read-back verified.'
      : `${target} vẫn chưa verified; các target đã thành công được giữ nguyên.`
    history.addMessage(threadId, 'assistant', message)
    return { ...workspace, message }
  })
  ipcMain.handle('lifecycle:advance-decision', async (_event, threadId: string, answers: Record<string, string>) => {
    if (activeRuns.has(threadId)) throw new Error('Thread này đang có một turn chạy')
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
  ipcMain.handle('figma:allow-target', (_event, sessionId: string) => allowFigmaTarget(sessionId, false))
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
    if (activeRuns.has(input.threadId)) throw new Error('Thread này đang có một turn chạy')
    const thread = history.getThread(input.threadId)
    const profile = history.getProfile(thread.providerId)
    const userMessage = history.addMessage(input.threadId, 'user', input.content.trim())
    const turnId = history.startTurn(input.threadId, input.content.trim())
    const controller = new AbortController()
    let turnFinished = false
    activeRuns.set(input.threadId, controller)
    try {
      const interaction = classifyCanvasInteraction(input.content, input.selection, input.canvas)
      const effectiveSelection = interaction.selection ?? input.selection
      const apiKey = secrets.get(profile.id)
      const response = await providers.get(profile.providerId).reason({
        threadId: input.threadId,
        phase: thread.phase,
        message: input.content,
        recentMessages: history.recentMessages(input.threadId),
        ...(effectiveSelection ? { selection: effectiveSelection } : {}),
        ...(input.canvas ? { canvas: input.canvas } : {}),
        remoteRef: history.getActiveRemoteRef(input.threadId, profile.id),
      }, {
        modelId: profile.modelId,
        ...(apiKey ? { apiKey } : {}),
      }, controller.signal)
      const proposal = acceptCompletedProviderEvents(workspaceFor(input.threadId).runState, response.events, thread.phase)
      const normalizedInput = normalizeIntentText(input.content)
      const canvasSyncIntent = /^(sync canvas|dong bo canvas|doc canvas)/.test(normalizedInput)
      const removalCommand = interaction.kind === 'conversation' && !canvasSyncIntent
        ? proposal.result.commands.find((command) => command.type === 'remove_card')
        : undefined
      let changePreview
      let responseMessage = proposal.result.message
      let commands = proposal.result.commands
      const canvasMutationAllowed = interaction.kind === 'draw' || interaction.kind === 'edit'
      const requiredCanvasProgram = canvasMutationAllowed
        ? planExplicitCanvasRequest(input.content, effectiveSelection, {
          recentMessages: history.recentMessages(input.threadId),
          ...(input.canvas ? { canvas: input.canvas } : {}),
        })
        : undefined
      const providerCanvasProgram = canvasMutationAllowed
        ? proposal.result.canvasProgram?.mode && proposal.result.canvasProgram.mode !== 'none'
          ? proposal.result.canvasProgram
          : legacyCommandsToCanvasProgram(proposal.result.commands)
        : undefined
      const providerProgramComplete = Boolean(providerCanvasProgram && requiredCanvasProgram && canvasProgramCovers(providerCanvasProgram, requiredCanvasProgram))
      const canvasProgram = requiredCanvasProgram && (!providerCanvasProgram || !providerProgramComplete)
        ? requiredCanvasProgram
        : providerCanvasProgram
      const canvasProgramSource = canvasProgram
        ? requiredCanvasProgram && canvasProgram === requiredCanvasProgram
          ? providerCanvasProgram ? 'provider_augmented' as const : 'deterministic_fallback' as const
          : 'provider' as const
        : 'none' as const
      let canvasRequestId: string | null = null
      if (canvasSyncIntent && input.canvas) {
        const semanticNodes = input.canvas.shapes.filter((shape) => shape.semanticId && shape.nodeKind)
        const selected = effectiveSelection?.selectedShapeCount ?? 0
        responseMessage = `Đã đọc canvas vào chat context: ${semanticNodes.length} semantic node, ${input.canvas.bindings?.length ?? 0} kết nối${selected > 0 ? ` và ${selected} phần tử đang chọn` : ''}. ProductSpec chưa thay đổi. Bạn có thể feedback vùng chọn, yêu cầu AI cập nhật scene, hoặc chốt canvas thành MVP để tạo preview.`
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
            reason: input.content.trim(),
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
      } else if (interaction.kind === 'clarify_edit') {
        responseMessage = 'Bạn muốn sửa phần nào trên canvas? Hãy chọn một hoặc nhiều node, hoặc nhắc đúng tên node rồi gửi yêu cầu lại.'
        commands = []
      } else if (interaction.kind === 'promote') {
        responseMessage = 'Đang chuẩn bị ProductSpec preview từ canvas. Chưa có artifact nào được ghi.'
        commands = []
      } else if (canvasProgram?.mode && canvasProgram.mode !== 'none' && (interaction.kind === 'draw' || interaction.kind === 'edit')) {
        canvasRequestId = `canvas-request:${turnId}`
        pendingCanvasExecutions.set(canvasRequestId, {
          threadId: input.threadId,
          program: canvasProgram,
          kind: interaction.kind,
        })
        responseMessage = interaction.kind === 'draw'
          ? /prototype low-fidelity/i.test(canvasProgram.summary)
            ? 'Đang dựng các màn hình prototype low-fidelity có thể chỉnh trực tiếp trên canvas. Sau khi render, mình sẽ báo số frame và kết quả đọc lại.'
            : 'Đang vẽ trên canvas. Mình sẽ xác nhận sau khi áp dụng và đọc lại thành công.'
          : 'Đang cập nhật vùng canvas đã chọn. Mình sẽ xác nhận sau khi áp dụng và đọc lại thành công.'
      } else {
        const workspace = workspaceFor(input.threadId)
        if (workspace.runState.phase === 'IDEA_INTAKE' && proposal.result.phase === 'discover') {
          const advanced = advanceReasoningPhase(workspace.runState, proposal.result, timestamp())
          lifecycle.saveReasoningCheckpoint(advanced.state, advanced.checkpoint)
          responseMessage = 'Mình đã chuẩn hóa ý tưởng. Hãy khóa ba clarification bên dưới để tạo phương án.'
        } else if (workspace.runState.phase === 'DELIVERY'
          && workspace.runState.status === 'ACTIVE'
          && /^(tiep tuc|next|lam tiep|roi sao)\b/.test(normalizeIntentText(input.content))) {
          responseMessage = deliveryStatusMessage(workspace.runState.productSpec)
        }
      }
      const assistantMessage = history.addMessage(input.threadId, 'assistant', responseMessage)
      const switchCommand = commands.find((command) => command.type === 'switch_view')
      if (switchCommand?.type === 'switch_view') history.setThreadPhase(input.threadId, switchCommand.view)
      history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
      history.completeTurn(turnId, 'completed', response.events)
      turnFinished = true
      return {
        userMessage,
        assistantMessage,
        commands,
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
    }
  })
  ipcMain.handle('chat:cancel', (_event, threadId: string) => activeRuns.get(threadId)?.abort())
  ipcMain.handle('demo:reset', () => resetDemoWorkspace())
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
        setter.call(input, 'Mini App hỗ trợ nhân viên đặt bữa trưa tại văn phòng');
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
        setter.call(input, 'Nhóm vận hành pantry ca trưa');
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
        setter.call(input, 'MVP pantry nội bộ theo khung giờ');
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
          transparent: detail.messages.some((message) => message.role === 'user' && message.content.includes('MVP pantry nội bộ'))
            && detail.messages.some((message) => message.role === 'assistant' && message.content.includes('Bước tiếp theo'))
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
          .filter((shape) => shape.textContent?.includes('ĐẶT NHÓM'))
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
              confirmed: detail.messages.some((message) => message.role === 'assistant' && message.content.includes('Đã đọc canvas vào chat context')),
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
      shapePreserved: false,
      specUnchanged: false,
      previewReady: false,
      historyRecorded: false,
      invalidRejected: false,
    }
    if (canvasGesture.required) {
      const target = await window.webContents.executeJavaScript(`(async () => {
        const deliver = [...document.querySelectorAll('.view-tab')].find((item) => item.textContent?.trim() === 'Deliver');
        deliver?.click();
        await new Promise((resolve) => setTimeout(resolve, 350));
        const shape = [...document.querySelectorAll('.tl-shape')].find((item) => item.textContent?.includes('REQ-PAYMENT'));
        if (!shape) return null;
        const rect = shape.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()`) as { x: number; y: number } | null
      canvasGesture.targetFound = Boolean(target)
      if (target) {
        const dragTarget = { x: target.x + 48, y: target.y + 24 }
        window.webContents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseMove', x: dragTarget.x, y: dragTarget.y, button: 'left' })
        window.webContents.sendInputEvent({ type: 'mouseUp', x: dragTarget.x, y: dragTarget.y, button: 'left', clickCount: 1 })
        await wait(250)
        canvasGesture.dragPresentationOnly = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          const shape = [...document.querySelectorAll('.tl-shape')].find((item) => item.textContent?.includes('REQ-PAYMENT'));
          const rect = shape?.getBoundingClientRect();
          const moved = rect && Math.hypot(rect.left + rect.width / 2 - ${target.x}, rect.top + rect.height / 2 - ${target.y}) > 10;
          return Boolean(moved && workspace.runState.productSpec.version === 1 && workspace.preview === null);
        })()`) as boolean
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z', modifiers: ['meta'] })
        await wait(250)
        const restoredTarget = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          const shape = [...document.querySelectorAll('.tl-shape')].find((item) => item.textContent?.includes('REQ-PAYMENT'));
          if (!shape) return null;
          const rect = shape.getBoundingClientRect();
          const current = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
          return { ...current, unchanged: workspace.runState.productSpec.version === 1 && workspace.preview === null };
        })()`) as { x: number; y: number; unchanged: boolean } | null
        canvasGesture.undoPresentationOnly = Boolean(restoredTarget?.unchanged
          && Math.hypot(restoredTarget.x - target.x, restoredTarget.y - target.y) <= 5)
        const deleteTarget = restoredTarget ?? target
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'mouseMove', x: deleteTarget.x, y: deleteTarget.y })
        await wait(50)
        window.webContents.sendInputEvent({ type: 'mouseDown', x: deleteTarget.x, y: deleteTarget.y, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseUp', x: deleteTarget.x, y: deleteTarget.y, button: 'left', clickCount: 1 })
        await wait(100)
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' })
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await wait(250)
          const state = await window.webContents.executeJavaScript(`(async () => {
            const [summary] = await window.pmAgent.threads.list();
            const thread = await window.pmAgent.threads.get(summary.id);
            const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
            return {
              shapePreserved: [...document.querySelectorAll('.tl-shape')].some((item) => item.textContent?.includes('REQ-PAYMENT')),
              specUnchanged: workspace.runState.productSpec.version === 1
                && workspace.runState.productSpec.requirements.find((item) => item.id === 'REQ-PAYMENT')?.status === 'in_scope',
              previewReady: workspace.runState.status === 'WAITING_FOR_APPROVAL'
                && workspace.preview?.intent.targetEntityId === 'REQ-PAYMENT',
              historyRecorded: thread.messages.some((message) => message.content.includes('[Canvas]'))
            };
          })()`) as Pick<typeof canvasGesture, 'shapePreserved' | 'specUnchanged' | 'previewReady' | 'historyRecorded'>
          Object.assign(canvasGesture, state)
          if (canvasGesture.shapePreserved && canvasGesture.specUnchanged && canvasGesture.previewReady && canvasGesture.historyRecorded) break
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
    const approvalAttempts = figmaLive.required ? 240 : 60
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
          executionPanelReady: ['Figma', 'Backlog mock', 'PRD Markdown']
            .every((label) => document.querySelector('.execution-panel')?.innerText.includes(label))
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
        const button = [...document.querySelectorAll('.execution-panel button')]
          .find((item) => item.title?.toLowerCase().includes(${JSON.stringify(expectedFailureTarget)}));
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
            executionPanelReady: ['Figma', 'Mock Jira', 'Mock Zdoc'].every((label) => document.querySelector('.execution-panel')?.innerText.includes(label))
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
      promotionPreview: false,
      promoted: false,
      scriptApplied: false,
      artifactVerified: false,
    }
    if (semanticFlow.required) {
      await window.webContents.executeJavaScript(`document.querySelector('.new-thread-button')?.click()`)
      await wait(600)
      if (process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER) {
        await window.webContents.executeJavaScript(`(async () => {
          const active = document.querySelector('.thread-row.active')?.getAttribute('data-thread-id');
          if (active) await window.pmAgent.threads.setProvider(active, ${JSON.stringify(process.env.PM_AGENT_SMOKE_CANVAS_PROVIDER)});
        })()`)
      }
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'Tôi đang muốn kickoff một ý tưởng miniapp đặt xe');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`)
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await wait(500)
        const kickoff = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const detail = await window.pmAgent.threads.get(thread.id);
          const snapshot = JSON.stringify(detail.canvasSnapshot ?? {});
          return {
            blank: (snapshot.match(/\"nodeKind\"/g) || []).length === 0,
            confirmed: detail.messages.some((message) => message.role === 'assistant' && message.content.includes('chuẩn hóa ý tưởng'))
          };
        })()`) as { blank: boolean; confirmed: boolean }
        semanticFlow.blankAfterKickoff = kickoff.blank
        semanticFlow.kickoffConfirmed = kickoff.confirmed
        if (kickoff.blank && kickoff.confirmed) break
      }
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'cho tôi toàn bộ flow đi');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`)
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await wait(500)
        const state = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const detail = await window.pmAgent.threads.get(thread.id);
          const snapshot = JSON.stringify(detail.canvasSnapshot ?? {});
          return {
            nodes: (snapshot.match(/\"nodeKind\"/g) || []).length,
            edges: (snapshot.match(/\"type\":\"arrow\"/g) || []).length,
            infiniteCanvas: !document.querySelector('.view-tabs') && Boolean(document.querySelector('.tl-container')),
            providerProgram: ['provider', 'provider_augmented'].includes(document.querySelector('.canvas-workspace')?.getAttribute('data-program-source') ?? ''),
            receiptConfirmed: detail.messages.some((message) => message.role === 'assistant' && message.content.startsWith('Đã vẽ '))
          };
        })()`)
        Object.assign(semanticFlow, state)
        if (semanticFlow.nodes >= 14 && semanticFlow.edges >= 14 && semanticFlow.infiniteCanvas && semanticFlow.receiptConfirmed) break
      }
      const beforeAmbiguous = { nodes: semanticFlow.nodes, edges: semanticFlow.edges }
      await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.composer textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, 'tạo thêm đi chứ');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`)
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await wait(500)
        semanticFlow.ambiguousEditBlocked = await window.webContents.executeJavaScript(`(async () => {
          const [thread] = await window.pmAgent.threads.list();
          const detail = await window.pmAgent.threads.get(thread.id);
          const snapshot = JSON.stringify(detail.canvasSnapshot ?? {});
          return detail.messages.some((message) => message.role === 'assistant' && message.content.includes('Hãy chọn một hoặc nhiều node'))
            && (snapshot.match(/\"nodeKind\"/g) || []).length === ${beforeAmbiguous.nodes}
            && (snapshot.match(/\"type\":\"arrow\"/g) || []).length === ${beforeAmbiguous.edges};
        })()`) as boolean
        if (semanticFlow.ambiguousEditBlocked) break
      }
      const feedback = await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        return window.pmAgent.chat.send({
          threadId: thread.id,
          content: 'Thêm retry và nhánh lỗi vào bước đang chọn',
          selection: { entityId: 'chon-diem-den', label: 'Chọn điểm đến', selectedShapeCount: 1, shapeIds: ['shape:canvas-chon-diem-den'] },
          canvas: {
            schemaVersion: 1,
            revision: 2,
            selectedShapeIds: ['shape:canvas-chon-diem-den'],
            shapes: [{
              id: 'shape:canvas-chon-diem-den',
              semanticId: 'chon-diem-den',
              type: 'geo',
              label: 'Chọn điểm đến',
              nodeKind: 'screen',
              x: 960,
              y: 0,
              width: 220,
              height: 150
            }]
          }
        });
      })()`) as {
        canvasProgram: import('@pm-agent/domain').CanvasProgram
        canvasProgramSource: 'provider' | 'provider_augmented' | 'deterministic_fallback' | 'none'
        canvasRequestId: string | null
      }
      const feedbackThreadId = history.listThreads()[0]!.id
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
        semanticFlow.feedbackApplied = snapshot.includes('chon-diem-den-retry') && snapshot.includes('chon-diem-den-error')
        semanticFlow.feedbackReceiptConfirmed = detail.messages.some((message) => message.role === 'assistant' && message.content.startsWith('Đã cập nhật vùng canvas đã chọn'))
        if (semanticFlow.feedbackApplied && semanticFlow.feedbackReceiptConfirmed) break
      }
      const flowImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-canvas-flow.png'), flowImage.toPNG())
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
          const [thread] = await window.pmAgent.threads.list();
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          return workspace.runState.phase === 'DELIVERY' && workspace.runState.productSpec.version === 2
            && workspace.runState.productSpec.requirements.length >= 3;
        })()`) as boolean
        if (semanticFlow.promoted) break
      }
      const activeThreadId = await window.webContents.executeJavaScript(`document.querySelector('.thread-row.active')?.getAttribute('data-thread-id')`) as string
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
        && canvasGesture.shapePreserved && canvasGesture.specUnchanged
        && canvasGesture.previewReady && canvasGesture.historyRecorded && canvasGesture.invalidRejected))
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
    console.log(`[smoke] ${JSON.stringify({ passed, reset, providerSwitch, lifecycleFlow, rejection, canvasGesture, ambiguity, semanticFlow, ...initial, ...final, ...approval, expectedFailureTarget, recovery, ...figmaSetup, ...figmaLive, screenshot: process.env.PM_AGENT_SMOKE_CAPTURE })}`)
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
  })
  void canvasBridge.start().catch((error) => console.error('[canvas-bridge] failed to start', error))
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
