import { join, resolve } from 'node:path'
import { existsSync, writeFileSync } from 'node:fs'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import { approveActions, createImpactPreview } from '@pm-agent/agent-core'
import { FigmaRuntimeManager } from '@pm-agent/connectors'
import type {
  ChangeIntent,
  ConfigureProviderInput,
  DesktopApi,
  LifecycleWorkspaceState,
  ProviderProfile,
  SendChatInput,
} from '@pm-agent/domain'
import { transitionRunState } from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { HistoryStore, LifecycleStore } from '@pm-agent/persistence'
import { ProviderRegistry } from '@pm-agent/reasoning'
import { SecretStore } from './secret-store'

const { app, BrowserWindow, ipcMain, shell } = electron

let mainWindow: BrowserWindowType | null = null
let history: HistoryStore
let lifecycle: LifecycleStore
let figmaRuntime: FigmaRuntimeManager
let secrets: SecretStore
const providers = new ProviderRegistry()
const activeRuns = new Map<string, AbortController>()

if (process.env.PM_AGENT_USER_DATA) app.setPath('userData', process.env.PM_AGENT_USER_DATA)

const providerEnv: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}

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
    resolve(__dirname, '../../../..'),
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
    runState = lifecycle.initializeRun(threadId, `run:${threadId}`, mealOrderingProductSpec, createdAt)
  }
  const preview = runState.status === 'WAITING_FOR_APPROVAL' && runState.pendingIntent
    ? createImpactPreview(runState.productSpec, runState.pendingIntent, runState.id, runState.lastCheckpointAt)
    : null
  return { runState, preview }
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

function registerIpc(): void {
  ipcMain.handle('threads:list', (_event, query?: string) => history.listThreads(query))
  ipcMain.handle('threads:create', () => history.createThread())
  ipcMain.handle('threads:get', (_event, threadId: string) => history.getThread(threadId))
  ipcMain.handle('threads:archive', (_event, threadId: string) => history.archiveThread(threadId))
  ipcMain.handle('threads:set-provider', (_event, threadId: string, profileId: string) => history.setThreadProvider(threadId, profileId))

  ipcMain.handle('canvas:save', (_event, threadId: string, snapshot: unknown) => history.saveCanvas(threadId, snapshot))

  ipcMain.handle('lifecycle:get-workspace', (_event, threadId: string) => workspaceFor(threadId))
  ipcMain.handle('lifecycle:approve-change', (_event, threadId: string) => {
    const workspace = workspaceFor(threadId)
    const { runState } = workspace
    if (runState.status !== 'WAITING_FOR_APPROVAL' || !runState.pendingIntent) {
      throw new Error('Không có change plan đang chờ duyệt')
    }
    const preview = createImpactPreview(runState.productSpec, runState.pendingIntent, runState.id, runState.lastCheckpointAt)
    const currentHashes = runState.pendingActions.map((action) => action.payloadHash).join(':')
    const previewHashes = preview.actions.map((action) => action.payloadHash).join(':')
    if (currentHashes !== previewHashes) throw new Error('Change plan đã thay đổi và cần preview lại')

    const decidedAt = timestamp()
    const approved = approveActions(runState.pendingActions, decidedAt)
    const approvedState = transitionRunState({
      ...runState,
      productSpec: preview.after,
      pendingIntent: null,
      pendingActions: approved.actions,
    }, 'APPROVE', decidedAt)
    lifecycle.commitApprovedChange(approvedState, approved.approvals)
    history.setThreadPhase(threadId, 'change')
    const message = `Đã duyệt ProductSpec v${preview.after.version}. Ba artifact actions đã khóa payload; chưa ghi ra ngoài cho tới khi connector sẵn sàng.`
    history.addMessage(threadId, 'assistant', message)
    return { runState: approvedState, preview: null, message }
  })

  ipcMain.handle('figma:status', () => figmaRuntime.status())
  ipcMain.handle('figma:start', () => figmaRuntime.start())
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
    const controller = new AbortController()
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
      const paymentRemoval = response.result.commands.find((command) => command.type === 'remove_card' && isPaymentRemoval(command.query))
      let changePreview
      let responseMessage = response.result.message
      let commands = response.result.commands
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
          const preview = createImpactPreview(workspace.runState.productSpec, intent, workspace.runState.id, checkpointAt)
          let nextState = transitionRunState(workspace.runState, 'REQUEST_CHANGE', checkpointAt)
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
      }
      const assistantMessage = history.addMessage(input.threadId, 'assistant', responseMessage)
      const switchCommand = commands.find((command) => command.type === 'switch_view')
      if (switchCommand?.type === 'switch_view') history.setThreadPhase(input.threadId, switchCommand.view)
      history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
      return { userMessage, assistantMessage, commands, ...(changePreview ? { changePreview } : {}) }
    } finally {
      activeRuns.delete(input.threadId)
    }
  })
  ipcMain.handle('chat:cancel', (_event, threadId: string) => activeRuns.get(threadId)?.abort())
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
      preload: join(__dirname, '../preload/index.cjs'),
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
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function runSmokeCheck(window: BrowserWindowType): Promise<void> {
  try {
    const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))
    await wait(2_500)
    const initial = await window.webContents.executeJavaScript(`({
      hasApi: Boolean(window.pmAgent?.threads && window.pmAgent?.chat && window.pmAgent?.lifecycle),
      hasCanvas: Boolean(document.querySelector('.tl-container')),
      hasSeed: document.body.innerText.includes('REQ-PAYMENT')
    })`) as { hasApi: boolean; hasCanvas: boolean; hasSeed: boolean }

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
    if (final.hasPreview) {
      await window.webContents.executeJavaScript(`document.querySelector('.approve-button')?.click()`)
    }
    let approval = { committed: false, specVersion: 0, paymentStatus: '', actionsApproved: false }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await wait(250)
      approval = await window.webContents.executeJavaScript(`(async () => {
        const [thread] = await window.pmAgent.threads.list();
        const workspace = await window.pmAgent.lifecycle.getWorkspace(thread.id);
        return {
          committed: document.body.innerText.includes('Đã duyệt ProductSpec v2'),
          specVersion: workspace.runState.productSpec.version,
          paymentStatus: workspace.runState.productSpec.requirements.find((item) => item.id === 'REQ-PAYMENT')?.status ?? '',
          actionsApproved: workspace.runState.pendingActions.every((action) => action.status === 'approved')
        };
      })()`) as typeof approval
      if (approval.committed && approval.specVersion === 2) break
    }
    await window.webContents.executeJavaScript(`document.querySelector('.integration-button')?.click()`)
    await wait(500)
    const figmaSetup = await window.webContents.executeJavaScript(`({
      hasSetupDialog: Boolean(document.querySelector('.figma-setup-dialog')),
      runtimeReady: document.querySelector('.figma-setup-dialog')?.innerText.includes('Runtime local')
        && document.querySelector('.figma-setup-dialog')?.innerText.includes('Runtime sẵn sàng'),
      pluginBuilt: document.querySelector('.figma-setup-dialog')?.innerText.includes('Manifest và bundle đã sẵn sàng'),
      waitingForPlugin: document.querySelector('.figma-setup-dialog')?.innerText.includes('Import vào Figma Desktop')
        || document.querySelector('.figma-setup-dialog')?.innerText.includes('Figma đã kết nối')
    })`) as { hasSetupDialog: boolean; runtimeReady: boolean; pluginBuilt: boolean; waitingForPlugin: boolean }
    const figmaSetupImage = await window.webContents.capturePage()
    writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!.replace(/\.png$/, '-figma-setup.png'), figmaSetupImage.toPNG())
    await window.webContents.executeJavaScript(`document.querySelector('.figma-setup-dialog .icon-button')?.click()`)
    const image = await window.webContents.capturePage()
    writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!, image.toPNG())
    const passed = initial.hasApi && initial.hasCanvas && initial.hasSeed
      && final.hasPreview && !final.pending && !final.hasError
      && approval.committed && approval.specVersion === 2
      && approval.paymentStatus === 'removed' && approval.actionsApproved
      && figmaSetup.hasSetupDialog && figmaSetup.runtimeReady && figmaSetup.pluginBuilt && figmaSetup.waitingForPlugin
    console.log(`[smoke] ${JSON.stringify({ passed, ...initial, ...final, ...approval, ...figmaSetup, screenshot: process.env.PM_AGENT_SMOKE_CAPTURE })}`)
    app.exit(passed ? 0 : 1)
  } catch (error) {
    console.error('[smoke] failed', error)
    app.exit(1)
  }
}

app.whenReady().then(() => {
  const databasePath = join(app.getPath('userData'), 'pm-lifecycle-agent.sqlite')
  history = new HistoryStore(databasePath)
  lifecycle = new LifecycleStore(databasePath)
  figmaRuntime = new FigmaRuntimeManager(figmaRuntimePaths())
  secrets = new SecretStore(join(app.getPath('userData'), 'provider-secrets.json'))
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
  figmaRuntime?.stop()
  lifecycle?.close()
  history?.close()
})
