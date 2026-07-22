import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Archive,
  Bot,
  Cable,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  GitCompareArrows,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react'
import type {
  CanvasSelectionContext,
  ChangePreview,
  ChatMessage,
  FigmaSetupStatus,
  ExecutionSummary,
  LifecycleWorkspaceState,
  ProviderCommand,
  ProviderProbe,
  ProviderProfile,
  ThreadDetail,
  ThreadSummary,
  PlannedAction,
} from '@pm-agent/domain'

const CanvasWorkspace = lazy(async () => {
  const module = await import('./CanvasWorkspace')
  return { default: module.CanvasWorkspace }
})

function relativeTime(value: string): string {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'vừa xong'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ`
  return `${Math.floor(seconds / 86400)} ngày`
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
  return 'Đã xảy ra lỗi không xác định'
}

export function App(): React.JSX.Element {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null)
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [search, setSearch] = useState('')
  const [historyOpen, setHistoryOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsProfile, setSettingsProfile] = useState<ProviderProfile | null>(null)
  const [figmaSetupOpen, setFigmaSetupOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [figmaStatus, setFigmaStatus] = useState<FigmaSetupStatus | null>(null)
  const [selection, setSelection] = useState<CanvasSelectionContext | undefined>()
  const [lifecycleWorkspace, setLifecycleWorkspace] = useState<LifecycleWorkspaceState | null>(null)
  const [commandBatch, setCommandBatch] = useState<{ id: number; commands: ProviderCommand[] }>({ id: 0, commands: [] })

  const refreshThreads = useCallback(async (query = search) => {
    const next = await window.pmAgent.threads.list(query)
    setThreads(next)
    return next
  }, [search])

  const openThread = useCallback(async (threadId: string) => {
    setLoading(true)
    setError(null)
    try {
      const [detail, workspace] = await Promise.all([
        window.pmAgent.threads.get(threadId),
        window.pmAgent.lifecycle.getWorkspace(threadId),
      ])
      setActiveThread(detail)
      setLifecycleWorkspace(workspace)
      setSelection(undefined)
      setCommandBatch({ id: 0, commands: [] })
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([window.pmAgent.threads.list(), window.pmAgent.providers.list(), window.pmAgent.figma.status()])
      .then(async ([initialThreads, initialProfiles, initialFigmaStatus]) => {
        setThreads(initialThreads)
        setProfiles(initialProfiles)
        setFigmaStatus(initialFigmaStatus)
        if (initialThreads[0]) await openThread(initialThreads[0].id)
        else setLoading(false)
      })
      .catch((nextError) => {
        setError(errorText(nextError))
        setLoading(false)
      })
  }, [openThread])

  useEffect(() => {
    if (!figmaSetupOpen) return
    const refresh = (): void => { void window.pmAgent.figma.status().then(setFigmaStatus) }
    refresh()
    const timer = setInterval(refresh, 1_500)
    return () => clearInterval(timer)
  }, [figmaSetupOpen])

  useEffect(() => {
    const timer = setTimeout(() => void refreshThreads(search), 220)
    return () => clearTimeout(timer)
  }, [refreshThreads, search])

  const createThread = async (): Promise<void> => {
    const detail = await window.pmAgent.threads.create()
    setActiveThread(detail)
    setLifecycleWorkspace(await window.pmAgent.lifecycle.getWorkspace(detail.id))
    await refreshThreads()
  }

  const archiveThread = async (threadId: string): Promise<void> => {
    await window.pmAgent.threads.archive(threadId)
    const next = await refreshThreads()
    if (activeThread?.id === threadId) {
      if (next[0]) await openThread(next[0].id)
      else setActiveThread(null)
    }
  }

  const switchProvider = async (profileId: string): Promise<void> => {
    if (!activeThread) return
    const detail = await window.pmAgent.threads.setProvider(activeThread.id, profileId)
    setActiveThread(detail)
    await refreshThreads()
  }

  const sendMessage = async (content: string): Promise<void> => {
    if (!activeThread || sending || !content.trim()) return
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      threadId: activeThread.id,
      role: 'user',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }
    setActiveThread({ ...activeThread, messages: [...activeThread.messages, optimistic] })
    setSending(true)
    setError(null)
    try {
      const result = await window.pmAgent.chat.send({
        threadId: activeThread.id,
        content: content.trim(),
        ...(selection ? { selection } : {}),
      })
      const [detail, workspace] = await Promise.all([
        window.pmAgent.threads.get(activeThread.id),
        window.pmAgent.lifecycle.getWorkspace(activeThread.id),
      ])
      setActiveThread(detail)
      setLifecycleWorkspace(workspace)
      setCommandBatch({ id: Date.now(), commands: result.commands })
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
      const detail = await window.pmAgent.threads.get(activeThread.id)
      setActiveThread(detail)
    } finally {
      setSending(false)
    }
  }

  const stopMessage = async (): Promise<void> => {
    if (!activeThread) return
    await window.pmAgent.chat.cancel(activeThread.id)
  }

  const approveChange = async (): Promise<void> => {
    if (!activeThread || approving) return
    setApproving(true)
    setError(null)
    try {
      const result = await window.pmAgent.lifecycle.approveChange(activeThread.id)
      setLifecycleWorkspace(result)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      setCommandBatch({ id: Date.now(), commands: [{ type: 'switch_view', view: 'change' }] })
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
    }
  }

  const retryAction = async (target: PlannedAction['target']): Promise<void> => {
    if (!activeThread) return
    setApproving(true)
    setError(null)
    try {
      const result = await window.pmAgent.lifecycle.retryAction(activeThread.id, target)
      setLifecycleWorkspace(result)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
    }
  }

  const activeProfile = profiles.find((profile) => profile.id === activeThread?.providerId)

  const resetDemo = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.pmAgent.demo.reset()
      setSearch('')
      setActiveThread(result.thread)
      setLifecycleWorkspace(result.workspace)
      setSelection(undefined)
      setCommandBatch({ id: 0, commands: [] })
      setThreads(await window.pmAgent.threads.list())
      setResetOpen(false)
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={historyOpen ? 'app-shell' : 'app-shell history-collapsed'}>
      <aside className="history-panel">
        <div className="brand-row">
          <div className="brand-mark">ZA</div>
          <div className="brand-copy">
            <strong>PM Lifecycle</strong>
            <span>Local workspace</span>
          </div>
          <button className="icon-button reset-demo-button" title="Reset demo" onClick={() => setResetOpen(true)}>
            <RotateCcw size={17} />
          </button>
          <button className="icon-button collapse-button" title="Thu gọn lịch sử" onClick={() => setHistoryOpen(false)}>
            <ChevronLeft size={18} />
          </button>
        </div>
        <button className="new-thread-button" onClick={() => void createThread()}>
          <Plus size={17} />
          Cuộc hội thoại mới
        </button>
        <label className="search-field">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm history" />
        </label>
        <div className="thread-list">
          {threads.map((thread) => (
            <div className={thread.id === activeThread?.id ? 'thread-row active' : 'thread-row'} key={thread.id}>
              <button className="thread-main" onClick={() => void openThread(thread.id)}>
                <strong>{thread.title}</strong>
                <span>{thread.lastMessage ?? 'Canvas trống'}</span>
                <small>{thread.phase} · {relativeTime(thread.updatedAt)}</small>
              </button>
              <button className="thread-archive" title="Lưu trữ" onClick={() => void archiveThread(thread.id)}>
                <Archive size={15} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="center-panel">
        <header className="topbar">
          {!historyOpen && (
            <button className="icon-button" title="Mở lịch sử" onClick={() => setHistoryOpen(true)}>
              <ChevronRight size={18} />
            </button>
          )}
          <div className="thread-heading">
            <strong>{activeThread?.title ?? 'PM Lifecycle Agent'}</strong>
            <span>{activeThread ? `Phase · ${activeThread.phase}` : 'Tạo thread để bắt đầu'}</span>
          </div>
          <div className="provider-controls">
            <span className={activeProfile?.hasCredential ? 'status-dot ready' : 'status-dot'} />
            <select
              aria-label="Reasoning provider"
              value={activeThread?.providerId ?? ''}
              disabled={!activeThread || sending}
              onChange={(event) => void switchProvider(event.target.value)}
            >
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
            </select>
            <span className="model-label">{activeProfile?.modelId ?? 'No provider'}</span>
            <button
              className="icon-button"
              title="Cấu hình provider"
              disabled={!activeProfile}
              onClick={() => activeProfile && setSettingsProfile(activeProfile)}
            >
              <Settings size={18} />
            </button>
            <button
              className={figmaStatus?.target && figmaStatus.designSystem ? 'integration-button connected' : 'integration-button'}
              title="Figma integration"
              onClick={() => setFigmaSetupOpen(true)}
            >
              <Cable size={17} />
              <span>Figma</span>
              <i />
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <CircleAlert size={17} />
            <span>{error}</span>
            <button className="icon-button" title="Đóng" onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}

        <div className="workspace-body">
          {loading ? (
            <div className="center-state"><LoaderCircle className="spin" size={26} /> Đang mở thread</div>
          ) : activeThread ? (
            <Suspense fallback={<div className="center-state"><LoaderCircle className="spin" size={26} /> Đang hydrate canvas</div>}>
              <CanvasWorkspace
                key={activeThread.id}
                threadId={activeThread.id}
                snapshot={activeThread.canvasSnapshot}
                initialView={activeThread.phase}
                commandBatch={commandBatch}
                productSpec={lifecycleWorkspace?.runState.productSpec}
                changePreview={lifecycleWorkspace?.preview ?? undefined}
                changeEntityIds={lifecycleWorkspace?.preview?.affectedEntityIds
                  ?? lifecycleWorkspace?.runState.pendingActions.flatMap((action) => action.entityIds)
                  ?? []}
                onSelectionChange={setSelection}
              />
            </Suspense>
          ) : (
            <div className="center-state">
              <Bot size={30} />
              Chưa có cuộc hội thoại
              <button className="primary-button" onClick={() => void createThread()}><Plus size={16} /> Tạo mới</button>
            </div>
          )}
        </div>
      </section>

      <ChatPanel
        messages={activeThread?.messages ?? []}
        selection={selection}
        sending={sending}
        approving={approving}
        preview={lifecycleWorkspace?.preview ?? undefined}
        execution={lifecycleWorkspace?.execution ?? undefined}
        disabled={!activeThread}
        onSend={sendMessage}
        onStop={stopMessage}
        onApprove={approveChange}
        onRetry={retryAction}
      />

      {settingsProfile && (
        <ProviderSettings
          profile={settingsProfile}
          onClose={() => setSettingsProfile(null)}
          onSaved={async () => {
            const next = await window.pmAgent.providers.list()
            setProfiles(next)
            setSettingsProfile(next.find((item) => item.id === settingsProfile.id) ?? null)
            if (activeThread) setActiveThread(await window.pmAgent.threads.get(activeThread.id))
          }}
        />
      )}

      {figmaSetupOpen && (
        <FigmaSetupDialog
          status={figmaStatus}
          onClose={() => setFigmaSetupOpen(false)}
          onStart={async () => setFigmaStatus(await window.pmAgent.figma.start())}
          onAllowTarget={async (sessionId) => setFigmaStatus(await window.pmAgent.figma.allowTarget(sessionId))}
          onRefreshDesignSystem={async () => setFigmaStatus(await window.pmAgent.figma.refreshDesignSystem())}
          onShowManifest={() => window.pmAgent.figma.showManifest()}
          onOpenControlPlane={() => window.pmAgent.figma.openControlPlane()}
        />
      )}

      {resetOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setResetOpen(false)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Reset demo" onMouseDown={(event) => event.stopPropagation()}>
            <header><RotateCcw size={19} /><strong>Reset demo workspace?</strong></header>
            <p>History, canvas, runs và mock artifacts sẽ được thay bằng fixture meal-ordering ban đầu.</p>
            <footer>
              <button className="secondary-button" onClick={() => setResetOpen(false)}>Hủy</button>
              <button className="primary-button confirm-reset-button" disabled={loading} onClick={() => void resetDemo()}>Reset</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}

function FigmaSetupDialog({
  status,
  onClose,
  onStart,
  onAllowTarget,
  onRefreshDesignSystem,
  onShowManifest,
  onOpenControlPlane,
}: {
  status: FigmaSetupStatus | null
  onClose(): void
  onStart(): Promise<void>
  onAllowTarget(sessionId: string): Promise<void>
  onRefreshDesignSystem(): Promise<void>
  onShowManifest(): Promise<void>
  onOpenControlPlane(): Promise<void>
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setOperationError(null)
    try {
      await operation()
    } catch (nextError) {
      setOperationError(errorText(nextError))
    } finally {
      setBusy(false)
    }
  }
  const runtimeReady = status?.runtime === 'ready'
  const activeSession = status?.sessions.find((session) => session.sessionId === status.activeSession) ?? status?.sessions[0]
  const integrationReady = Boolean(status?.target && status.designSystem)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="figma-setup-dialog" role="dialog" aria-modal="true" aria-label="Figma setup" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="figma-dialog-title"><Cable size={20} /><div><strong>Kết nối Figma</strong><span>Local sandbox · không cần REST token</span></div></div>
          <button className="icon-button" title="Đóng" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="setup-steps">
          <div className={runtimeReady ? 'setup-step complete' : 'setup-step'}>
            <span className="step-index">1</span>
            <div><strong>Runtime local</strong><small>{status?.detail ?? 'Đang kiểm tra runtime...'}</small></div>
            {!runtimeReady && status?.binaryReady && <button disabled={busy} onClick={() => void run(onStart)}>Khởi động</button>}
          </div>
          <div className={status?.pluginBuilt ? 'setup-step complete' : 'setup-step'}>
            <span className="step-index">2</span>
            <div><strong>Plugin build</strong><small>{status?.pluginBuilt ? 'Manifest và bundle đã sẵn sàng.' : 'Chạy ./run.sh setup để build plugin.'}</small></div>
            {status?.pluginBuilt && <button disabled={busy} onClick={() => void run(onShowManifest)}><FolderOpen size={14} /> Mở manifest</button>}
          </div>
          <div className={status?.pluginConnected ? 'setup-step complete' : 'setup-step current'}>
            <span className="step-index">3</span>
            <div>
              <strong>{status?.pluginConnected ? 'Figma đã kết nối' : 'Import vào Figma Desktop'}</strong>
              <small>{status?.pluginConnected
                ? `${activeSession?.fileName ?? status.sessionCount + ' session'} · ${activeSession?.pageName ?? 'active'}`
                : 'Plugins → Development → Import plugin from manifest, sau đó chạy ZA Talk To Figma.'}</small>
            </div>
          </div>
          <div className={status?.target ? 'setup-step complete' : status?.pluginConnected ? 'setup-step current' : 'setup-step'}>
            <span className="step-index">4</span>
            <div>
              <strong>{status?.target ? 'Sandbox đã allowlist' : 'Xác nhận target sandbox'}</strong>
              <small>{status?.target
                ? `${status.target.fileName} · ${status.target.pageName}`
                : 'Chỉ cho phép đọc file và page đang mở; target khác sẽ bị từ chối.'}</small>
            </div>
            {!status?.target && status?.pluginConnected && activeSession && (
              <button className="allow-target-button" disabled={busy} onClick={() => void run(() => onAllowTarget(activeSession.sessionId))}>
                <ShieldCheck size={14} /> Dùng page này
              </button>
            )}
          </div>
        </div>
        <div className="manifest-path"><span>manifest.json</span><code>{status?.manifestPath ?? 'Đang xác định đường dẫn...'}</code></div>
        {status?.designSystem && (
          <div className={status.designSystem.mode === 'live' ? 'ds-context-status live' : 'ds-context-status fallback'}>
            <ShieldCheck size={18} />
            <div>
              <strong>{status.designSystem.mode === 'live' ? 'Live Design System context' : 'Synthetic fixture guard'}</strong>
              <span>{status.designSystem.componentCount} components · {status.designSystem.tokenCount} tokens · {status.designSystem.fingerprint.slice(0, 12)}</span>
              {status.designSystem.fallbackReason && <small>{status.designSystem.fallbackReason}</small>}
            </div>
            <button className="icon-button" disabled={busy} title="Đọc lại Design System" onClick={() => void run(onRefreshDesignSystem)}>
              <RefreshCw className={busy ? 'spin' : ''} size={16} />
            </button>
          </div>
        )}
        {operationError && <div className="figma-operation-error"><CircleAlert size={15} /> {operationError}</div>}
        <footer>
          <span className={integrationReady ? 'figma-ready-label ready' : 'figma-ready-label'}>
            {integrationReady ? <CheckCircle2 size={15} /> : <LoaderCircle size={15} />}
            {integrationReady ? 'Sẵn sàng cho preflight' : status?.pluginConnected ? 'Chờ allowlist' : 'Đang chờ plugin'}
          </span>
          <button className="secondary-button" disabled={!runtimeReady || busy} onClick={() => void run(onOpenControlPlane)}>
            <ExternalLink size={14} /> Runtime console
          </button>
        </footer>
      </section>
    </div>
  )
}

function ChatPanel({
  messages,
  selection,
  sending,
  approving,
  preview,
  execution,
  disabled,
  onSend,
  onStop,
  onApprove,
  onRetry,
}: {
  messages: ChatMessage[]
  selection?: CanvasSelectionContext
  sending: boolean
  approving: boolean
  preview?: ChangePreview
  execution?: ExecutionSummary
  disabled: boolean
  onSend(content: string): Promise<void>
  onStop(): Promise<void>
  onApprove(): Promise<void>
  onRetry(target: PlannedAction['target']): Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const canSend = !disabled && !sending && draft.trim().length > 0

  const submit = async (): Promise<void> => {
    if (!canSend) return
    const content = draft
    setDraft('')
    await onSend(content)
  }

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <div><strong>Chat</strong><span>Agent + canvas commands</span></div>
        <CheckCircle2 size={18} className="verified-icon" />
      </div>
      {selection && (
        <div className="selection-chip">
          <span>Đang chọn</span>
          <strong>{selection.label.replace('\n', ' · ')}</strong>
        </div>
      )}
      <div className="message-list">
        {messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? 'Bạn' : message.role === 'assistant' ? 'Agent' : 'System'}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {sending && (
          <article className="message assistant pending">
            <span>Agent</span>
            <p><LoaderCircle className="spin" size={15} /> Đang reasoning...</p>
          </article>
        )}
      </div>
      {preview && <ChangePreviewPanel preview={preview} approving={approving} onApprove={onApprove} />}
      {execution && <ExecutionPanel execution={execution} busy={approving} onRetry={onRetry} />}
      <div className="composer">
        <textarea
          value={draft}
          disabled={disabled}
          placeholder="Nhập ý tưởng hoặc điều khiển canvas..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {sending ? (
          <button className="send-button stop" title="Dừng turn" onClick={() => void onStop()}><Square size={16} /></button>
        ) : (
          <button className="send-button" title="Gửi" disabled={!canSend} onClick={() => void submit()}><Send size={17} /></button>
        )}
      </div>
    </aside>
  )
}

function ChangePreviewPanel({
  preview,
  approving,
  onApprove,
}: {
  preview: ChangePreview
  approving: boolean
  onApprove(): Promise<void>
}): React.JSX.Element {
  return (
    <section className="change-preview" aria-label="Change impact approval">
      <header>
        <div className="change-preview-title">
          <GitCompareArrows size={17} />
          <div><strong>Change impact</strong><span>ProductSpec v{preview.before.version} → v{preview.after.version}</span></div>
        </div>
        <span className="impact-count">{preview.affectedEntityIds.length}</span>
      </header>
      <div className="impact-list">
        {preview.changes.map((change) => (
          <div className="impact-row" key={change.entityId}>
            <span>{change.entityId}</span>
            <small>{change.change === 'removed' ? 'Loại khỏi MVP' : 'Cập nhật mapping'}</small>
          </div>
        ))}
      </div>
      <div className="artifact-targets">
        {preview.actions.map((action) => <span key={action.id}>{action.target === 'jira' || action.target === 'zdoc' ? 'Mock ' : ''}{action.target}</span>)}
      </div>
      <button className="approve-button" disabled={approving} onClick={() => void onApprove()}>
        {approving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
        {approving ? 'Đang đồng bộ' : 'Duyệt & đồng bộ'}
      </button>
    </section>
  )
}

function ExecutionPanel({
  execution,
  busy,
  onRetry,
}: {
  execution: ExecutionSummary
  busy: boolean
  onRetry(target: PlannedAction['target']): Promise<void>
}): React.JSX.Element {
  const labels: Record<PlannedAction['target'], string> = { figma: 'Figma', jira: 'Mock Jira', zdoc: 'Mock Zdoc' }
  return (
    <section className={`execution-panel ${execution.status}`} aria-label="Artifact execution status">
      <header>
        <div><strong>Artifact sync</strong><span>{execution.status.replace('_', ' ')}</span></div>
        {execution.status === 'verified' ? <CheckCircle2 size={18} /> : <GitCompareArrows size={18} />}
      </header>
      <div className="execution-list">
        {execution.actions.map((action) => {
          const retryable = action.status === 'failed' || action.status === 'verification_failed'
          return (
            <div className="execution-row" key={action.actionId}>
              <span className={`execution-state ${action.status}`} />
              <div><strong>{labels[action.target]}</strong><small>{action.status.replace('_', ' ')} · attempt {action.attempts}</small></div>
              {retryable && (
                <button className="icon-button" disabled={busy} title={`Retry ${labels[action.target]}`} onClick={() => void onRetry(action.target)}>
                  <RefreshCw className={busy ? 'spin' : ''} size={15} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ProviderSettings({
  profile,
  onClose,
  onSaved,
}: {
  profile: ProviderProfile
  onClose(): void
  onSaved(): Promise<void>
}): React.JSX.Element {
  const [modelId, setModelId] = useState(profile.modelId)
  const [apiKey, setApiKey] = useState('')
  const [probe, setProbe] = useState<ProviderProbe | null>(null)
  const [busy, setBusy] = useState(false)
  const needsKey = profile.costMode === 'api_paid'

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.pmAgent.providers.configure({
        profileId: profile.id,
        modelId,
        ...(apiKey.trim() ? { apiKey } : {}),
      })
      setApiKey('')
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  const runProbe = async (): Promise<void> => {
    setBusy(true)
    try {
      setProbe(await window.pmAgent.providers.probe(profile.id))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Provider settings" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><strong>{profile.displayName}</strong><span>{profile.providerId} · {profile.costMode}</span></div>
          <button className="icon-button" title="Đóng" onClick={onClose}><X size={18} /></button>
        </header>
        <label>
          <span>Model ID</span>
          <input value={modelId} onChange={(event) => setModelId(event.target.value)} />
        </label>
        {needsKey && (
          <label>
            <span>API key</span>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={profile.hasCredential ? 'Đã lưu trong Keychain' : 'Chưa cấu hình'} />
          </label>
        )}
        <div className="privacy-note">
          {profile.providerId === 'codex'
            ? 'Dùng phiên đăng nhập Codex CLI hiện tại. Thread ID chỉ được lưu như opaque provider segment.'
            : needsKey
              ? 'API key được mã hóa bằng Keychain; không lưu trong SQLite hoặc renderer.'
              : 'Provider offline deterministic, không gửi dữ liệu ra ngoài.'}
        </div>
        {probe && <div className={probe.available ? 'probe-result ready' : 'probe-result'}><strong>{probe.label}</strong><span>{probe.detail}</span></div>}
        <footer>
          <button className="secondary-button" disabled={busy} onClick={() => void runProbe()}>Kiểm tra</button>
          <button className="primary-button" disabled={busy || !modelId.trim()} onClick={() => void save()}>{busy ? 'Đang xử lý' : 'Lưu cấu hình'}</button>
        </footer>
      </section>
    </div>
  )
}
