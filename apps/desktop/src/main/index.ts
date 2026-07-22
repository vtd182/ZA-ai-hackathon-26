import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import type {
  ConfigureProviderInput,
  DesktopApi,
  ProviderProfile,
  SendChatInput,
} from '@pm-agent/domain'
import { HistoryStore } from '@pm-agent/persistence'
import { ProviderRegistry } from '@pm-agent/reasoning'
import { SecretStore } from './secret-store'

const { app, BrowserWindow, ipcMain, shell } = electron

let mainWindow: BrowserWindowType | null = null
let history: HistoryStore
let secrets: SecretStore
const providers = new ProviderRegistry()
const activeRuns = new Map<string, AbortController>()

if (process.env.PM_AGENT_USER_DATA) app.setPath('userData', process.env.PM_AGENT_USER_DATA)

const providerEnv: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
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
      const assistantMessage = history.addMessage(input.threadId, 'assistant', response.result.message)
      const switchCommand = response.result.commands.find((command) => command.type === 'switch_view')
      if (switchCommand?.type === 'switch_view') history.setThreadPhase(input.threadId, switchCommand.view)
      history.saveProviderSegment(input.threadId, profile.id, profile.modelId, response.remoteRef)
      return { userMessage, assistantMessage, commands: response.result.commands }
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
      hasApi: Boolean(window.pmAgent?.threads && window.pmAgent?.chat),
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
    let final = { hasAssistantOutcome: false, hasError: false, messageCount: 0, pending: true }
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(500)
      final = await window.webContents.executeJavaScript(`({
        hasAssistantOutcome: document.body.innerText.includes('đề xuất trên canvas'),
        hasError: Boolean(document.querySelector('.error-banner')),
        messageCount: document.querySelectorAll('.message').length,
        pending: Boolean(document.querySelector('.message.pending'))
      })`) as typeof final
      if (final.hasError || (!final.pending && final.messageCount >= 4)) break
    }
    const image = await window.webContents.capturePage()
    writeFileSync(process.env.PM_AGENT_SMOKE_CAPTURE!, image.toPNG())
    const passed = initial.hasApi && initial.hasCanvas && initial.hasSeed
      && final.messageCount >= 4 && !final.pending && !final.hasError
    console.log(`[smoke] ${JSON.stringify({ passed, ...initial, ...final, screenshot: process.env.PM_AGENT_SMOKE_CAPTURE })}`)
    app.exit(passed ? 0 : 1)
  } catch (error) {
    console.error('[smoke] failed', error)
    app.exit(1)
  }
}

app.whenReady().then(() => {
  history = new HistoryStore(join(app.getPath('userData'), 'pm-lifecycle-agent.sqlite'))
  secrets = new SecretStore(join(app.getPath('userData'), 'provider-secrets.json'))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  activeRuns.forEach((controller) => controller.abort())
  history?.close()
})
