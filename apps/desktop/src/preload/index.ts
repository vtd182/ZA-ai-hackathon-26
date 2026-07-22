import electron from 'electron'
import type { ConfigureProviderInput, DesktopApi, SendChatInput } from '@pm-agent/domain'

const { contextBridge, ipcRenderer } = electron

const api: DesktopApi = {
  threads: {
    list: (query) => ipcRenderer.invoke('threads:list', query),
    create: () => ipcRenderer.invoke('threads:create'),
    get: (threadId) => ipcRenderer.invoke('threads:get', threadId),
    archive: (threadId) => ipcRenderer.invoke('threads:archive', threadId),
    setProvider: (threadId, profileId) => ipcRenderer.invoke('threads:set-provider', threadId, profileId),
  },
  canvas: {
    save: (threadId, snapshot) => ipcRenderer.invoke('canvas:save', threadId, snapshot),
  },
  lifecycle: {
    getWorkspace: (threadId) => ipcRenderer.invoke('lifecycle:get-workspace', threadId),
    approveChange: (threadId) => ipcRenderer.invoke('lifecycle:approve-change', threadId),
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
}

contextBridge.exposeInMainWorld('pmAgent', api)
