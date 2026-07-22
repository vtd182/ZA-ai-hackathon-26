import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import { acceptCompletedProviderEvents, advanceReasoningPhase, approveActions, assertProviderSwitchAllowed, createHandoffPackage, createImpactPreview, executeConnectorAction, rejectActions, selectDecisionOption } from '@pm-agent/agent-core'
import {
  createFigmaArtifactPlan,
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
  SqliteMockArtifactStore,
} from '@pm-agent/connectors'
import type {
  ChangeIntent,
  ConfigureProviderInput,
  DesktopApi,
  LifecycleWorkspaceState,
  ProviderProfile,
  SendChatInput,
  PlannedAction,
  ProductSpec,
} from '@pm-agent/domain'
import {
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
const providers = new ProviderRegistry()
const activeRuns = new Map<string, AbortController>()

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
      mealOrderingProductSpec,
      createdAt,
      threadId === DEMO_THREAD_ID ? 'DELIVERY' : 'IDEA_INTAKE',
    )
  }
  const preview = runState.status === 'WAITING_FOR_APPROVAL' && runState.pendingIntent
    ? createImpactPreview(runState.productSpec, runState.pendingIntent, runState.id, runState.lastCheckpointAt)
    : null
  const execution = outbox.listRun(runState.id).length > 0 ? outbox.summary(runState.id) : null
  const reasoning = lifecycle.getLatestReasoningCheckpoint(runState.id)?.result ?? null
  return { runState, preview, execution, reasoning }
}

function moveToDeliveryForChange(state: RunState, at: string): RunState {
  let next = state
  if (next.phase === 'IDEA_INTAKE' && next.status === 'ACTIVE') next = transitionRunState(next, 'START_DISCOVERY', at)
  if (next.phase === 'DISCOVERY' && next.status === 'ACTIVE') next = transitionRunState(next, 'REQUEST_DECISION', at)
  if (next.phase === 'DECISION' && next.status === 'WAITING_FOR_DECISION') next = transitionRunState(next, 'SELECT_OPTION', at)
  return next
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
}

function figmaExecutionContext(): FigmaExecutionContext {
  const target = figmaIntegration.getActiveTarget()
  const context = target ? figmaIntegration.getContext(target.targetHash) : null
  if (target && context) {
    return { target, manifest: context.manifest, connectorMode: context.mode === 'live' ? 'live' : 'mock' }
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
  }
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
    idempotencyKey: `figma:${state.id}:v${spec.version}`,
  })
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
    state = transitionRunState(state, 'START_VERIFICATION', timestamp())
    state = transitionRunState(state, 'VERIFY_SUCCESS', timestamp())
  } else {
    state = transitionRunState(state, 'PARTIAL_FAILURE', timestamp())
  }
  lifecycle.saveRunState(state)
  return workspaceFor(threadId)
}

function isPaymentRemoval(query: string): boolean {
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return normalized.includes('payment') || normalized.includes('thanh toan') || normalized.includes('vi noi bo')
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
    const capture = await figmaMcp.captureDesignSystem(target)
    figmaIntegration.saveContext(normalizeFigmaDesignSystemContext(capture, target, syntheticZaloDesignSystem, timestamp()))
  }
  return figmaStatus()
}

function registerIpc(): void {
  ipcMain.handle('threads:list', (_event, query?: string) => history.listThreads(query))
  ipcMain.handle('threads:create', () => history.createThread())
  ipcMain.handle('threads:get', (_event, threadId: string) => history.getThread(threadId))
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

  ipcMain.handle('lifecycle:get-workspace', (_event, threadId: string) => workspaceFor(threadId))
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
    if (questions.length === 0 || questions.some((question) => !question.options.includes(answers[question.id] ?? ''))) {
      throw new Error('Hãy chọn một câu trả lời hợp lệ cho từng clarification')
    }
    const thread = history.getThread(threadId)
    const profile = history.getProfile(thread.providerId)
    const answerText = questions.map((question) => `${question.prompt}: ${answers[question.id]}`).join('\n')
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
  ipcMain.handle('lifecycle:select-decision', (_event, threadId: string, optionId: string) => {
    const workspace = workspaceFor(threadId)
    if (workspace.reasoning?.phase !== 'decide') throw new Error('Decision checkpoint chưa sẵn sàng')
    const option = workspace.reasoning.phaseData.options.find((item) => item.id === optionId)
    if (!option) throw new Error('Phương án không tồn tại')
    const next = selectDecisionOption(workspace.runState, workspace.reasoning, optionId, timestamp())
    lifecycle.saveRunState(next)
    history.setThreadPhase(threadId, 'deliver')
    history.addMessage(threadId, 'assistant', `Đã chọn ${option.title}. ProductSpec được giữ làm nguồn sự thật cho Delivery.`)
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
      const apiKey = secrets.get(profile.id)
      const response = await providers.get(profile.providerId).reason({
        threadId: input.threadId,
        phase: thread.phase,
        message: input.content,
        recentMessages: history.recentMessages(input.threadId),
        ...(input.selection ? { selection: input.selection } : {}),
        remoteRef: history.getActiveRemoteRef(input.threadId, profile.id),
      }, {
        modelId: profile.modelId,
        ...(apiKey ? { apiKey } : {}),
      }, controller.signal)
      const proposal = acceptCompletedProviderEvents(workspaceFor(input.threadId).runState, response.events, thread.phase)
      const paymentRemoval = proposal.result.commands.find((command) => command.type === 'remove_card' && isPaymentRemoval(command.query))
      let changePreview
      let responseMessage = proposal.result.message
      let commands = proposal.result.commands
      if (paymentRemoval) {
        const workspace = workspaceFor(input.threadId)
        const payment = workspace.runState.productSpec.requirements.find((requirement) => requirement.id === 'REQ-PAYMENT')
        if (workspace.preview) {
          changePreview = workspace.preview
          responseMessage = 'Change plan hiện tại vẫn đang chờ duyệt; payload và before/after chưa thay đổi.'
          commands = [{ type: 'focus_card', query: 'REQ-PAYMENT' }, { type: 'switch_view', view: 'change' }]
        } else if (payment?.status === 'in_scope') {
          const checkpointAt = timestamp()
          const intent: ChangeIntent = {
            id: `CHANGE-REMOVE-PAYMENT-V${workspace.runState.productSpec.version}`,
            operation: 'remove',
            targetEntityId: 'REQ-PAYMENT',
            reason: input.content.trim(),
          }
          const deliveryState = moveToDeliveryForChange(workspace.runState, checkpointAt)
          const preview = createImpactPreview(deliveryState.productSpec, intent, deliveryState.id, checkpointAt)
          let nextState = transitionRunState(deliveryState, 'REQUEST_CHANGE', checkpointAt)
          nextState = transitionRunState({ ...nextState, pendingIntent: intent, pendingActions: preview.actions }, 'PREVIEW_READY', checkpointAt)
          lifecycle.savePreview(nextState)
          history.setThreadPhase(input.threadId, 'change')
          changePreview = preview
          responseMessage = `Đã phân tích ${preview.affectedEntityIds.length} entity bị ảnh hưởng. Chưa có artifact nào được ghi; hãy kiểm tra before/after và duyệt change plan.`
          commands = [...commands, { type: 'switch_view', view: 'change' }]
        } else if (payment?.status === 'removed') {
          responseMessage = `REQ-PAYMENT đã bị loại khỏi ProductSpec v${workspace.runState.productSpec.version}; không tạo action trùng.`
          commands = [{ type: 'focus_card', query: 'REQ-PAYMENT' }, { type: 'switch_view', view: 'change' }]
        }
      } else {
        const workspace = workspaceFor(input.threadId)
        if (workspace.runState.phase === 'IDEA_INTAKE' && proposal.result.phase === 'discover') {
          const advanced = advanceReasoningPhase(workspace.runState, proposal.result, timestamp())
          lifecycle.saveReasoningCheckpoint(advanced.state, advanced.checkpoint)
          responseMessage = 'Mình đã chuẩn hóa ý tưởng. Hãy khóa ba clarification bên dưới để tạo phương án.'
        }
      }
      const assistantMessage = history.addMessage(input.threadId, 'assistant', responseMessage)
      const switchCommand = commands.find((command) => command.type === 'switch_view')
      if (switchCommand?.type === 'switch_view') history.setThreadPhase(input.threadId, switchCommand.view)
      history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
      history.completeTurn(turnId, 'completed', response.events)
      turnFinished = true
      return { userMessage, assistantMessage, commands, ...(changePreview ? { changePreview } : {}) }
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
    const initial = await window.webContents.executeJavaScript(`({
      hasApi: Boolean(window.pmAgent?.threads && window.pmAgent?.chat && window.pmAgent?.lifecycle && window.pmAgent?.demo),
      hasCanvas: Boolean(document.querySelector('.tl-container')),
      hasSeed: document.body.innerText.includes('REQ-PAYMENT')
    })`) as { hasApi: boolean; hasCanvas: boolean; hasSeed: boolean }

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

    const lifecycleFlow = { required: process.env.PM_AGENT_SMOKE_LIFECYCLE === '1', questions: 0, options: 0, delivered: false, resumed: false }
    if (lifecycleFlow.required) {
      await window.webContents.executeJavaScript(`document.querySelector('.new-thread-button')?.click()`)
      await wait(300)
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
      await window.webContents.executeJavaScript(`(() => {
        document.querySelectorAll('.clarification-list fieldset').forEach((fieldset) => fieldset.querySelector('button')?.click());
        setTimeout(() => document.querySelector('.phase-continue-button')?.click(), 30);
      })()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await wait(250)
        lifecycleFlow.options = await window.webContents.executeJavaScript(`document.querySelectorAll('.decision-options > button').length`) as number
        if (lifecycleFlow.options >= 2) break
      }
      const decisionImage = await window.webContents.capturePage()
      writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-decision.png'), decisionImage.toPNG())
      await window.webContents.executeJavaScript(`document.querySelector('.decision-options > button')?.click()`)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(250)
        lifecycleFlow.delivered = await window.webContents.executeJavaScript(`(async () => {
          const thread = (await window.pmAgent.threads.list()).find((item) => item.id !== ${JSON.stringify(DEMO_THREAD_ID)});
          const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
          return thread.phase === 'deliver' && workspace.runState.phase === 'DELIVERY' && workspace.runState.status === 'ACTIVE';
        })()`) as boolean
        if (lifecycleFlow.delivered) break
      }
      await window.webContents.executeJavaScript(`document.querySelector('[data-thread-id=${JSON.stringify(DEMO_THREAD_ID)}] .thread-main')?.click()`)
      await wait(350)
      lifecycleFlow.resumed = await window.webContents.executeJavaScript(`document.querySelector('[data-thread-id=${JSON.stringify(DEMO_THREAD_ID)}]')?.classList.contains('active')`) as boolean
    }

    if (process.env.PM_AGENT_SMOKE_PROVIDER) {
      await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        await window.pmAgent.threads.setProvider(thread.id, ${JSON.stringify(process.env.PM_AGENT_SMOKE_PROVIDER)});
      })()`)
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
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
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
          executionPanelReady: ['Figma', 'Mock Jira', 'Mock Zdoc']
            .every((label) => document.querySelector('.execution-panel')?.innerText.includes(label))
        };
      })()`) as typeof approval
      const expectedExecutionState = expectedFailureTarget
        ? approval.executionStatus === 'partial_failure' && approval.failedTargets.includes(expectedFailureTarget)
        : approval.executionVerified
      if (approval.committed && expectedExecutionState && approval.executionPanelReady) break
    }
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
    const figmaLive = { required: process.env.PM_AGENT_FIGMA_LIVE === '1', targetAllowed: false, contextReady: false, contextMode: '' }
    if (figmaLive.required) {
      await window.webContents.executeJavaScript(`document.querySelector('.allow-target-button')?.click()`)
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
      && (!lifecycleFlow.required || (lifecycleFlow.questions > 0 && lifecycleFlow.questions <= 3 && lifecycleFlow.options >= 2 && lifecycleFlow.options <= 3 && lifecycleFlow.delivered && lifecycleFlow.resumed))
      && (!rejection.required || (rejection.rejected && rejection.preservedVersion && rejection.noExecution && rejection.previewedAgain))
      && final.hasPreview && !final.pending && !final.hasError
      && approval.committed && approval.specVersion === 2
      && approval.paymentStatus === 'removed' && approval.actionsApproved
      && approval.executionVerified && approval.executionPanelReady
      && approval.verifiedTargets.join(',') === 'figma,jira,zdoc'
      && recovery.attempted === Boolean(expectedFailureTarget)
      && recovery.verified && recovery.preservedTargets
      && figmaSetup.hasSetupDialog && figmaSetup.runtimeReady && figmaSetup.pluginBuilt && figmaSetup.waitingForPlugin
      && (!figmaLive.required || (figmaLive.targetAllowed && figmaLive.contextReady))
    console.log(`[smoke] ${JSON.stringify({ passed, reset, providerSwitch, lifecycleFlow, rejection, ...initial, ...final, ...approval, expectedFailureTarget, recovery, ...figmaSetup, ...figmaLive, screenshot: process.env.PM_AGENT_SMOKE_CAPTURE })}`)
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
  figmaIntegration?.close()
  mockZdoc?.close()
  mockJira?.close()
  mockFigmaStore?.close()
  outbox?.close()
  lifecycle?.close()
  history?.close()
})
