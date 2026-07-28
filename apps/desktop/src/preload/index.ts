import electron from 'electron'
import type { ArtifactProgressEvent, ConfigureProviderInput, DesktopApi, ExternalCanvasCommandBatch, ExternalCanvasProgramBatch, SendChatInput } from '@pm-agent/domain'

const { contextBridge, ipcRenderer } = electron

const api: DesktopApi = {
  threads: {
    list: (query) => ipcRenderer.invoke('threads:list', query),
    create: () => ipcRenderer.invoke('threads:create'),
    get: (threadId) => ipcRenderer.invoke('threads:get', threadId),
    archive: (threadId) => ipcRenderer.invoke('threads:archive', threadId),
    setProvider: (threadId, profileId, confirmPaid) => ipcRenderer.invoke('threads:set-provider', threadId, profileId, confirmPaid),
    messages: (threadId, cursor, limit) => ipcRenderer.invoke('threads:messages', threadId, cursor, limit),
    exportBundle: (threadId) => ipcRenderer.invoke('threads:export-bundle', threadId),
  },
  canvas: {
    save: (threadId, snapshot) => ipcRenderer.invoke('canvas:save', threadId, snapshot),
    recordExecution: (receipt) => ipcRenderer.invoke('canvas:record-execution', receipt),
    recordFailure: (failure) => ipcRenderer.invoke('canvas:record-failure', failure),
    proposeCommand: (threadId, command) => ipcRenderer.invoke('canvas:propose-command', threadId, command),
    onExternalCommands: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, batch: ExternalCanvasCommandBatch): void => listener(batch)
      ipcRenderer.on('canvas:external-commands', handler)
      return () => ipcRenderer.removeListener('canvas:external-commands', handler)
    },
    onExternalProgram: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, batch: ExternalCanvasProgramBatch): void => listener(batch)
      ipcRenderer.on('canvas:external-program', handler)
      return () => ipcRenderer.removeListener('canvas:external-program', handler)
    },
  },
  lifecycle: {
    getWorkspace: (threadId) => ipcRenderer.invoke('lifecycle:get-workspace', threadId),
    approveChange: (threadId) => ipcRenderer.invoke('lifecycle:approve-change', threadId),
    rejectChange: (threadId) => ipcRenderer.invoke('lifecycle:reject-change', threadId),
    retryAction: (threadId, target) => ipcRenderer.invoke('lifecycle:retry-action', threadId, target),
    advanceDecision: (threadId, answers) => ipcRenderer.invoke('lifecycle:advance-decision', threadId, answers),
    selectDecision: (threadId, optionId, customTitle) => ipcRenderer.invoke('lifecycle:select-decision', threadId, optionId, customTitle),
    previewPromotion: (threadId, canvas) => ipcRenderer.invoke('lifecycle:preview-promotion', threadId, canvas),
    commitPromotion: (threadId, payloadHash) => ipcRenderer.invoke('lifecycle:commit-promotion', threadId, payloadHash),
    prepareArtifacts: (threadId) => ipcRenderer.invoke('lifecycle:prepare-artifacts', threadId),
    regenerateArtifacts: (threadId, feedback) => ipcRenderer.invoke('lifecycle:regenerate-artifacts', threadId, feedback),
    approveArtifacts: (threadId) => ipcRenderer.invoke('lifecycle:approve-artifacts', threadId),
    rejectArtifacts: (threadId) => ipcRenderer.invoke('lifecycle:reject-artifacts', threadId),
    showDocument: (threadId) => ipcRenderer.invoke('lifecycle:show-document', threadId),
    showBacklog: (threadId) => ipcRenderer.invoke('lifecycle:show-backlog', threadId),
    showZdoc: (threadId) => ipcRenderer.invoke('lifecycle:show-zdoc', threadId),
    onArtifactProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ArtifactProgressEvent): void => listener(progress)
      ipcRenderer.on('artifact:progress', handler)
      return () => ipcRenderer.removeListener('artifact:progress', handler)
    },
  },
  figma: {
    status: () => ipcRenderer.invoke('figma:status'),
    start: () => ipcRenderer.invoke('figma:start'),
    allowTarget: (sessionId) => ipcRenderer.invoke('figma:allow-target', sessionId),
    refreshDesignSystem: () => ipcRenderer.invoke('figma:refresh-design-system'),
    showManifest: () => ipcRenderer.invoke('figma:show-manifest'),
    openControlPlane: () => ipcRenderer.invoke('figma:open-control-plane'),
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    configure: (input: ConfigureProviderInput) => ipcRenderer.invoke('providers:configure', input),
    probe: (profileId) => ipcRenderer.invoke('providers:probe', profileId),
  },
  chat: {
    send: (input: SendChatInput) => ipcRenderer.invoke('chat:send', input),
    cancel: (threadId) => ipcRenderer.invoke('chat:cancel', threadId),
  },
  demo: {
    reset: () => ipcRenderer.invoke('demo:reset'),
  },
  devBridge: {
    status: () => ipcRenderer.invoke('dev-bridge:status'),
  },
}

contextBridge.exposeInMainWorld('pmAgent', api)
