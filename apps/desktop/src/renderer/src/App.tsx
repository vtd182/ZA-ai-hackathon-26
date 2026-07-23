import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { legacyCommandsToCanvasProgram } from '@pm-agent/canvas'
import {
  Archive,
  Bot,
  Cable,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  FolderOpen,
  GitCompareArrows,
  LayoutTemplate,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Route,
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
  CanvasDocumentContext,
  CanvasExecutionReceipt,
  CanvasProgram,
  CanvasPromotionPreview,
  ChangePreview,
  ChatMessage,
  FigmaSetupStatus,
  ExecutionSummary,
  LifecycleWorkspaceState,
  ProviderProbe,
  ProviderProfile,
  ThreadDetail,
  ThreadSummary,
  PlannedAction,
  PhaseReasoningResult,
} from '@pm-agent/domain'

const noCanvasProgram: CanvasProgram = { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null }

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

function isPromotionIntent(value: string): boolean {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /(chot|xac nhan|promote).*(flow|canvas|mvp|productspec)|chot flow/.test(normalized)
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
  const [pendingPaidProvider, setPendingPaidProvider] = useState<ProviderProfile | null>(null)
  const [figmaStatus, setFigmaStatus] = useState<FigmaSetupStatus | null>(null)
  const [selection, setSelection] = useState<CanvasSelectionContext | undefined>()
  const [canvasContext, setCanvasContext] = useState<CanvasDocumentContext | undefined>()
  const [lifecycleWorkspace, setLifecycleWorkspace] = useState<LifecycleWorkspaceState | null>(null)
  const [promotionPreview, setPromotionPreview] = useState<CanvasPromotionPreview | null>(null)
  const [programBatch, setProgramBatch] = useState<{ id: number; requestId?: string; program: CanvasProgram; source: CanvasExecutionReceipt['source'] }>({ id: 0, program: noCanvasProgram, source: 'provider' })

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
      setCanvasContext(undefined)
      setPromotionPreview(null)
      setProgramBatch({ id: 0, program: noCanvasProgram, source: 'provider' })
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

  useEffect(() => window.pmAgent.canvas.onExternalCommands((batch) => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [detail, workspace] = await Promise.all([
          window.pmAgent.threads.get(batch.threadId),
          window.pmAgent.lifecycle.getWorkspace(batch.threadId),
        ])
        setActiveThread(detail)
        setLifecycleWorkspace(workspace)
        setSelection(undefined)
        const program = legacyCommandsToCanvasProgram(batch.commands)
        if (program) setProgramBatch({ id: batch.batchId, program, source: 'developer' })
        await refreshThreads()
      } catch (nextError) {
        setError(errorText(nextError))
      } finally {
        setLoading(false)
      }
    })()
  }), [refreshThreads])

  useEffect(() => window.pmAgent.canvas.onExternalProgram((batch) => {
    void (async () => {
      if (activeThread?.id !== batch.threadId) await openThread(batch.threadId)
      setProgramBatch({ id: batch.batchId, ...(batch.requestId ? { requestId: batch.requestId } : {}), program: batch.program, source: batch.source })
    })().catch((nextError) => setError(errorText(nextError)))
  }), [activeThread?.id, openThread])

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
    setLoading(true)
    setError(null)
    try {
      const detail = await window.pmAgent.threads.create()
      const workspace = await window.pmAgent.lifecycle.getWorkspace(detail.id)
      setActiveThread(detail)
      setLifecycleWorkspace(workspace)
      setSelection(undefined)
      setCanvasContext(undefined)
      setPromotionPreview(null)
      setProgramBatch({ id: 0, program: noCanvasProgram, source: 'provider' })
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setLoading(false)
    }
  }

  const archiveThread = async (threadId: string): Promise<void> => {
    await window.pmAgent.threads.archive(threadId)
    const next = await refreshThreads()
    if (activeThread?.id === threadId) {
      if (next[0]) await openThread(next[0].id)
      else setActiveThread(null)
    }
  }

  const switchProvider = async (profileId: string, confirmPaid = false): Promise<void> => {
    if (!activeThread) return
    const nextProfile = profiles.find((profile) => profile.id === profileId)
    if (nextProfile?.costMode === 'api_paid' && !confirmPaid) {
      setPendingPaidProvider(nextProfile)
      return
    }
    try {
      const detail = await window.pmAgent.threads.setProvider(activeThread.id, profileId, confirmPaid)
      setActiveThread(detail)
      setPendingPaidProvider(null)
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    }
  }

  const sendMessage = async (
    content: string,
    canvasOverride?: CanvasDocumentContext,
    selectionOverride?: CanvasSelectionContext,
  ): Promise<void> => {
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
      const effectiveSelection = selectionOverride ?? selection
      const effectiveCanvas = canvasOverride ?? canvasContext
      const result = await window.pmAgent.chat.send({
        threadId: activeThread.id,
        content: content.trim(),
        ...(effectiveSelection ? { selection: effectiveSelection } : {}),
        ...(effectiveCanvas ? { canvas: effectiveCanvas } : {}),
      })
      const [detail, workspace] = await Promise.all([
        window.pmAgent.threads.get(activeThread.id),
        window.pmAgent.lifecycle.getWorkspace(activeThread.id),
      ])
      setActiveThread(detail)
      setLifecycleWorkspace(workspace)
      setProgramBatch({
        id: Date.now(),
        ...(result.canvasRequestId ? { requestId: result.canvasRequestId } : {}),
        program: result.canvasProgram,
        source: result.canvasProgramSource === 'none' ? 'provider' : result.canvasProgramSource,
      })
      if (isPromotionIntent(content) && canvasContext && canvasContext.shapes.length > 0) {
        setPromotionPreview(await window.pmAgent.lifecycle.previewPromotion(activeThread.id, canvasContext))
      }
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

  const loadEarlierMessages = async (): Promise<void> => {
    if (!activeThread?.messageNextCursor) return
    const page = await window.pmAgent.threads.messages(activeThread.id, activeThread.messageNextCursor, 50)
    setActiveThread({
      ...activeThread,
      messages: [...page.items, ...activeThread.messages],
      messageNextCursor: page.nextCursor,
    })
  }

  const approveChange = async (): Promise<void> => {
    if (!activeThread || approving) return
    setApproving(true)
    setError(null)
    try {
      const result = await window.pmAgent.lifecycle.approveChange(activeThread.id)
      setLifecycleWorkspace(result)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
    }
  }

  const rejectChange = async (): Promise<void> => {
    if (!activeThread || approving) return
    setApproving(true)
    setError(null)
    try {
      const result = await window.pmAgent.lifecycle.rejectChange(activeThread.id)
      setLifecycleWorkspace(result)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
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

  const commitPromotion = async (): Promise<void> => {
    if (!activeThread || !promotionPreview || approving) return
    setApproving(true)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.commitPromotion(activeThread.id, promotionPreview.payloadHash)
      setLifecycleWorkspace(workspace)
      setPromotionPreview(null)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
    }
  }

  const decideArtifacts = async (decision: 'approve' | 'reject'): Promise<void> => {
    if (!activeThread || approving) return
    setApproving(true)
    setError(null)
    try {
      const workspace = decision === 'approve'
        ? await window.pmAgent.lifecycle.approveArtifacts(activeThread.id)
        : await window.pmAgent.lifecycle.rejectArtifacts(activeThread.id)
      setLifecycleWorkspace(workspace)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
    }
  }

  const advanceDecision = async (answers: Record<string, string>): Promise<void> => {
    if (!activeThread || sending) return
    setSending(true)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.advanceDecision(activeThread.id, answers)
      setLifecycleWorkspace(workspace)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setSending(false)
    }
  }

  const selectDecision = async (optionId: string, customTitle?: string): Promise<void> => {
    if (!activeThread || sending) return
    setSending(true)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.selectDecision(activeThread.id, optionId, customTitle)
      setLifecycleWorkspace(workspace)
      setActiveThread(await window.pmAgent.threads.get(activeThread.id))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setSending(false)
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
      setCanvasContext(undefined)
      setPromotionPreview(null)
      setProgramBatch({ id: 0, program: noCanvasProgram, source: 'provider' })
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
            <div data-thread-id={thread.id} className={thread.id === activeThread?.id ? 'thread-row active' : 'thread-row'} key={thread.id}>
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
                programBatch={programBatch}
                agentBusy={sending}
                onContextChange={(context, nextSelection) => {
                  setCanvasContext(context)
                  setSelection(nextSelection)
                }}
                onExecution={async (receipt) => {
                  await window.pmAgent.canvas.recordExecution(receipt)
                  if (activeThread?.id === receipt.threadId) {
                    setActiveThread(await window.pmAgent.threads.get(receipt.threadId))
                    await refreshThreads()
                  }
                }}
                onExecutionError={async (failure) => {
                  await window.pmAgent.canvas.recordFailure(failure)
                  if (activeThread?.id === failure.threadId) {
                    setActiveThread(await window.pmAgent.threads.get(failure.threadId))
                    await refreshThreads()
                  }
                }}
                onSync={async (context, nextSelection) => {
                  await sendMessage(
                    nextSelection
                      ? `Sync canvas với chat và đọc vùng đang chọn: ${nextSelection.label}`
                      : 'Sync canvas với chat và tóm tắt scene hiện tại',
                    context,
                    nextSelection,
                  )
                }}
                onError={setError}
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
        hasEarlierMessages={Boolean(activeThread?.messageNextCursor)}
        selection={selection}
        sending={sending}
        approving={approving}
        preview={lifecycleWorkspace?.preview ?? undefined}
        clarification={lifecycleWorkspace?.runState.pendingClarification ?? undefined}
        execution={lifecycleWorkspace?.execution ?? undefined}
        reasoning={lifecycleWorkspace?.reasoning ?? undefined}
        productSpec={lifecycleWorkspace?.runState.productSpec}
        deliveryActive={lifecycleWorkspace?.runState.phase === 'DELIVERY' && lifecycleWorkspace.runState.status === 'ACTIVE'}
        canvasItemCount={canvasContext?.shapes.filter((shape) => shape.semanticId && shape.nodeKind).length ?? 0}
        promotionPreview={promotionPreview ?? undefined}
        artifactActions={lifecycleWorkspace?.runState.pendingIntent ? [] : lifecycleWorkspace?.runState.pendingActions ?? []}
        disabled={!activeThread}
        onSend={sendMessage}
        onStop={stopMessage}
        onLoadEarlier={loadEarlierMessages}
        onApprove={approveChange}
        onReject={rejectChange}
        onRetry={retryAction}
        onAdvanceDecision={advanceDecision}
        onSelectDecision={selectDecision}
        onCommitPromotion={commitPromotion}
        onCancelPromotion={() => setPromotionPreview(null)}
        onApproveArtifacts={() => decideArtifacts('approve')}
        onRejectArtifacts={() => decideArtifacts('reject')}
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

      {pendingPaidProvider && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingPaidProvider(null)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirm paid provider" onMouseDown={(event) => event.stopPropagation()}>
            <header><CircleAlert size={19} /><strong>Chuyển sang {pendingPaidProvider.displayName}?</strong></header>
            <p>Turn tiếp theo có thể phát sinh API cost và gửi context đã hiển thị tới provider này. Credential vẫn chỉ ở Keychain.</p>
            <footer>
              <button className="secondary-button" onClick={() => setPendingPaidProvider(null)}>Hủy</button>
              <button className="primary-button" onClick={() => void switchProvider(pendingPaidProvider.id, true)}>Xác nhận</button>
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
  hasEarlierMessages,
  selection,
  sending,
  approving,
  preview,
  clarification,
  execution,
  reasoning,
  productSpec,
  deliveryActive,
  canvasItemCount,
  promotionPreview,
  artifactActions,
  disabled,
  onSend,
  onStop,
  onLoadEarlier,
  onApprove,
  onReject,
  onRetry,
  onAdvanceDecision,
  onSelectDecision,
  onCommitPromotion,
  onCancelPromotion,
  onApproveArtifacts,
  onRejectArtifacts,
}: {
  messages: ChatMessage[]
  hasEarlierMessages: boolean
  selection?: CanvasSelectionContext
  sending: boolean
  approving: boolean
  preview?: ChangePreview
  clarification?: string
  execution?: ExecutionSummary
  reasoning?: PhaseReasoningResult
  productSpec?: import('@pm-agent/domain').ProductSpec
  deliveryActive: boolean
  canvasItemCount: number
  promotionPreview?: CanvasPromotionPreview
  artifactActions: PlannedAction[]
  disabled: boolean
  onSend(content: string): Promise<void>
  onStop(): Promise<void>
  onLoadEarlier(): Promise<void>
  onApprove(): Promise<void>
  onReject(): Promise<void>
  onRetry(target: PlannedAction['target']): Promise<void>
  onAdvanceDecision(answers: Record<string, string>): Promise<void>
  onSelectDecision(optionId: string, customTitle?: string): Promise<void>
  onCommitPromotion(): Promise<void>
  onCancelPromotion(): void
  onApproveArtifacts(): Promise<void>
  onRejectArtifacts(): Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
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
          <div><span>Context canvas</span><strong>{selection.label.replace('\n', ' · ')}</strong></div>
          <button
            type="button"
            title="Chat về vùng đang chọn"
            onClick={() => {
              setDraft(`Về ${selection.label.replace('\n', ' · ')}: `)
              requestAnimationFrame(() => composerRef.current?.focus())
            }}
          ><MessageSquareText size={15} /></button>
        </div>
      )}
      {productSpec && <ProductSpecInspector productSpec={productSpec} selection={selection} />}
      <div className="message-list">
        {hasEarlierMessages && (
          <button className="load-earlier-button" onClick={() => void onLoadEarlier()}><RefreshCw size={13} /> Tải tin cũ</button>
        )}
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
      {preview && <ChangePreviewPanel preview={preview} approving={approving} onApprove={onApprove} onReject={onReject} />}
      {promotionPreview && (
        <section className="promotion-panel" aria-label="ProductSpec promotion preview">
          <header><strong>Chốt thành ProductSpec v{promotionPreview.productSpec.version}</strong><span>{promotionPreview.sourceShapeIds.length} canvas nodes</span></header>
          <div className="spec-metrics">
            <span><b>{promotionPreview.productSpec.requirements.length}</b> Req</span>
            <span><b>{promotionPreview.productSpec.screens.length}</b> Screen</span>
            <span><b>{promotionPreview.productSpec.stories.length}</b> Story</span>
          </div>
          <p>{promotionPreview.productSpec.title}</p>
          <small>{promotionPreview.assumptions[0]}</small>
          <footer>
            <button className="secondary-button" disabled={approving} onClick={onCancelPromotion}>Hủy</button>
            <button className="primary-button" disabled={approving} onClick={() => void onCommitPromotion()}>Xác nhận</button>
          </footer>
        </section>
      )}
      {!promotionPreview && artifactActions.some((action) => action.status === 'pending_approval') && (
        <section className="promotion-panel artifact-plan-panel" aria-label="Artifact plan approval">
          <header><strong>Artifact plan</strong><span>Immutable preflight</span></header>
          <div className="artifact-targets">
            {artifactActions.map((action) => <span key={action.id}>{action.target === 'jira' ? 'Mock Jira' : action.target === 'zdoc' ? 'Mock Zdoc' : 'Figma'}</span>)}
          </div>
          <small>Mỗi target sẽ được ghi qua outbox, sau đó read-back và verify độc lập.</small>
          <footer>
            <button className="secondary-button" disabled={approving} onClick={() => void onRejectArtifacts()}>Hủy writes</button>
            <button className="primary-button" disabled={approving} onClick={() => void onApproveArtifacts()}>Duyệt & tạo</button>
          </footer>
        </section>
      )}
      {clarification && !preview && (
        <section className="ambiguity-panel" aria-label="Change clarification required">
          <CircleAlert size={18} />
          <div><strong>Cần xác định target</strong><span>{clarification}</span></div>
        </section>
      )}
      {execution && <ExecutionPanel execution={execution} busy={approving} onRetry={onRetry} />}
      {reasoning && (reasoning.phase === 'discover' || reasoning.phase === 'decide') && (
        <PhaseReasoningPanel
          reasoning={reasoning}
          busy={sending}
          onAdvance={onAdvanceDecision}
          onSelect={onSelectDecision}
        />
      )}
      {deliveryActive && productSpec && !preview && !promotionPreview && (
        <DeliveryGuide
          productSpec={productSpec}
          canvasItemCount={canvasItemCount}
          busy={sending}
          onSend={onSend}
        />
      )}
      <div className="composer">
        <textarea
          ref={composerRef}
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

function DeliveryGuide({
  productSpec,
  canvasItemCount,
  busy,
  onSend,
}: {
  productSpec: import('@pm-agent/domain').ProductSpec
  canvasItemCount: number
  busy: boolean
  onSend(content: string): Promise<void>
}): React.JSX.Element {
  const requirements = productSpec.requirements.filter((item) => item.status !== 'removed').length
  return (
    <section className="delivery-guide" aria-label="Delivery next steps">
      <header>
        <div><strong>Delivery workspace</strong><span>ProductSpec v{productSpec.version} · {productSpec.status}</span></div>
        <CheckCircle2 size={17} />
      </header>
      <div className="delivery-status">
        <span><b>{requirements}</b> Req</span>
        <span><b>{productSpec.screens.length}</b> Screen</span>
        <span><b>{canvasItemCount}</b> Canvas</span>
      </div>
      <p>Chọn đầu ra tiếp theo. Agent sẽ báo trước việc đang làm và xác nhận sau khi đọc lại canvas.</p>
      <div className="delivery-actions">
        <button disabled={busy} onClick={() => void onSend('Vẽ user flow MVP dựa trên phương án đã chọn')}>
          <Route size={16} /><span><strong>User flow</strong><small>Luồng và nhánh chính</small></span>
        </button>
        <button disabled={busy} onClick={() => void onSend('Vẽ prototype low-fidelity các màn hình MVP dựa trên phương án đã chọn')}>
          <LayoutTemplate size={16} /><span><strong>Prototype</strong><small>3–5 màn hình chỉnh được</small></span>
        </button>
        <button disabled={busy} onClick={() => void onSend('Tiếp tục hoàn thiện ProductSpec: chỉ ra scope, giả định và điểm còn thiếu')}>
          <FileText size={16} /><span><strong>ProductSpec</strong><small>Bổ sung scope còn thiếu</small></span>
        </button>
      </div>
    </section>
  )
}

function ProductSpecInspector({
  productSpec,
  selection,
}: {
  productSpec: import('@pm-agent/domain').ProductSpec
  selection?: CanvasSelectionContext
}): React.JSX.Element {
  const selected = selection?.entityId
    ? [productSpec.idea, ...productSpec.goals, ...productSpec.findings, ...productSpec.requirements, ...productSpec.screens, ...productSpec.stories, ...productSpec.dependencies, ...productSpec.decisions]
      .find((entity) => entity.id === selection.entityId)
    : undefined
  return (
    <section className="spec-inspector" aria-label="ProductSpec inspector">
      <header><strong>ProductSpec v{productSpec.version}</strong><span>{productSpec.status}</span></header>
      <div className="spec-metrics">
        <span><b>{productSpec.requirements.filter((item) => item.status !== 'removed').length}</b> Req</span>
        <span><b>{productSpec.screens.length}</b> Screen</span>
        <span><b>{productSpec.stories.length}</b> Story</span>
      </div>
      {selected && <p><strong>{selected.id}</strong><span>{selected.title}</span></p>}
    </section>
  )
}

function PhaseReasoningPanel({
  reasoning,
  busy,
  onAdvance,
  onSelect,
}: {
  reasoning: Extract<PhaseReasoningResult, { phase: 'discover' | 'decide' }>
  busy: boolean
  onAdvance(answers: Record<string, string>): Promise<void>
  onSelect(optionId: string, customTitle?: string): Promise<void>
}): React.JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<string, boolean>>({})
  const [customDecision, setCustomDecision] = useState('')
  const [customDecisionOpen, setCustomDecisionOpen] = useState(false)
  useEffect(() => {
    setAnswers({})
    setCustomAnswers({})
    setCustomDecision('')
    setCustomDecisionOpen(false)
  }, [reasoning])
  if (reasoning.phase === 'decide') {
    return (
      <section className="phase-reasoning-panel" aria-label="Decision options">
        <header><strong>Phương án MVP</strong><span>Chọn một hướng để vào Delivery</span></header>
        <div className="decision-options">
          {reasoning.phaseData.options.map((option) => (
            <button key={option.id} disabled={busy} onClick={() => void onSelect(option.id)}>
              <span>{option.id === reasoning.phaseData.recommendedOptionId ? 'Đề xuất' : 'Phương án'}</span>
              <strong>{option.title}</strong>
              <small>{option.tradeoff}</small>
            </button>
          ))}
          <button
            type="button"
            className={customDecisionOpen ? 'custom-option selected' : 'custom-option'}
            disabled={busy}
            onClick={() => setCustomDecisionOpen(true)}
          >
            <span>Khác</span>
            <strong>Đề xuất phương án riêng</strong>
            <small>Mô tả hướng MVP phù hợp với bối cảnh của bạn.</small>
          </button>
          {customDecisionOpen && (
            <div className="custom-decision-input">
              <input
                autoFocus
                maxLength={200}
                value={customDecision}
                placeholder="Ví dụ: MVP chỉ dành cho pantry nội bộ..."
                onChange={(event) => setCustomDecision(event.target.value)}
              />
              <button
                className="primary-button"
                disabled={busy || customDecision.trim().length < 2}
                onClick={() => void onSelect('CUSTOM', customDecision.trim())}
              >Chọn hướng này</button>
            </div>
          )}
        </div>
      </section>
    )
  }
  const complete = reasoning.phaseData.questions.every((question) => Boolean(answers[question.id]?.trim()))
  return (
    <section className="phase-reasoning-panel" aria-label="Clarification questions">
      <header><strong>Clarification</strong><span>{reasoning.phaseData.questions.length}/3 câu hỏi</span></header>
      <div className="clarification-list">
        {reasoning.phaseData.questions.map((question) => (
          <fieldset key={question.id}>
            <legend>{question.prompt}</legend>
            <div className="segmented-options">
              {question.options.map((option) => (
                <button
                  type="button"
                  className={answers[question.id] === option ? 'selected' : ''}
                  key={option}
                  onClick={() => {
                    setCustomAnswers((current) => ({ ...current, [question.id]: false }))
                    setAnswers((current) => ({ ...current, [question.id]: option }))
                  }}
                >{option}</button>
              ))}
              <button
                type="button"
                className={customAnswers[question.id] ? 'selected' : ''}
                onClick={() => {
                  setCustomAnswers((current) => ({ ...current, [question.id]: true }))
                  setAnswers((current) => ({ ...current, [question.id]: '' }))
                }}
              >Khác</button>
            </div>
            {customAnswers[question.id] && (
              <input
                className="custom-answer-input"
                autoFocus
                maxLength={240}
                value={answers[question.id] ?? ''}
                placeholder="Nhập câu trả lời của bạn"
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
              />
            )}
          </fieldset>
        ))}
      </div>
      <button className="primary-button phase-continue-button" disabled={!complete || busy} onClick={() => void onAdvance(answers)}>
        {busy ? <LoaderCircle className="spin" size={15} /> : <ChevronRight size={15} />} Tạo phương án
      </button>
    </section>
  )
}

function ChangePreviewPanel({
  preview,
  approving,
  onApprove,
  onReject,
}: {
  preview: ChangePreview
  approving: boolean
  onApprove(): Promise<void>
  onReject(): Promise<void>
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
      <div className="approval-actions">
        <button className="secondary-button reject-button" disabled={approving} onClick={() => void onReject()}><X size={15} /> Từ chối</button>
        <button className="approve-button" disabled={approving} onClick={() => void onApprove()}>
          {approving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
          {approving ? 'Đang đồng bộ' : 'Duyệt & đồng bộ'}
        </button>
      </div>
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
