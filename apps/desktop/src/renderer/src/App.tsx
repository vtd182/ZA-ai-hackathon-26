import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { legacyCommandsToCanvasProgram } from '@pm-agent/canvas'
import {
  Archive,
  Bot,
  Cable,
  CheckCircle2,
  Maximize2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  GitCompareArrows,
  History,
  LayoutTemplate,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquareTerminal,
  X,
} from 'lucide-react'
import type {
  CanvasDiffContext,
  ArtifactProgressEvent,
  CanvasSelectionContext,
  CanvasDocumentContext,
  CanvasExecutionReceipt,
  CanvasProgram,
  CanvasPromotionPreview,
  ChangePreview,
  ChatMessage,
  ConversationSuggestion,
  DevBridgeStatus,
  FigmaSetupStatus,
  ExecutionSummary,
  LifecycleWorkspaceState,
  MockJiraPlan,
  MockZdocPlan,
  ProviderProbe,
  ProviderProfile,
  ThreadDetail,
  ThreadSummary,
  PlannedAction,
  PhaseReasoningResult,
} from '@pm-agent/domain'
import { artifactBriefFacts, artifactBriefForAction, artifactTargetLabel } from './artifact-brief-copy'
import { canvasCollaborationCopy, type CanvasCollaborationAction } from './canvas-collaboration-copy'
import { classifyErrorText } from './error-classifier'
import { productSpecReadiness, productSurfaceLabel } from './productspec-readiness'
import { providerRuntimeCopy } from './provider-runtime-copy'
import { workflowStateReceipt, type WorkflowStateReceipt } from './workflow-state-receipt'

const noCanvasProgram: CanvasProgram = { schemaVersion: 1, mode: 'none', summary: '', operations: [], script: null }
// Curated set surfaced in the "/" menu — draw first, then the Figma artifact.
// Legacy aliases (/figma prepare|approve|retry, /studio *) still parse for back-compat.
const slashCommands = [
  { command: '/canvas flow', label: 'Vẽ user flow', detail: 'Luồng và nhánh chính', acceptsPrompt: true },
  { command: '/canvas prototype', label: 'Vẽ prototype', detail: '3–5 màn hình chính', acceptsPrompt: true },
  { command: '/canvas sequence', label: 'Sequence diagram', detail: 'Người dùng · OA/Bot · Backend', acceptsPrompt: true },
  { command: '/canvas state', label: 'State machine', detail: 'Trạng thái + transition', acceptsPrompt: true },
  { command: '/canvas mindmap', label: 'Mind map', detail: 'Phân rã tính năng', acceptsPrompt: true },
  { command: '/canvas er', label: 'ER data model', detail: 'Entity + quan hệ', acceptsPrompt: true },
  { command: '/spec confirm', label: 'Chốt ProductSpec', detail: 'Khóa source of truth trước artifact' },
  { command: '/change remove', label: 'Impact remove', detail: 'Before/after + approval', acceptsPrompt: true },
  { command: '/figma create', label: 'Tạo Figma', detail: 'Kickoff: Figma + PRD + backlog' },
  { command: '/figma refine', label: 'Sửa Figma', detail: 'Agent sửa bản hiện tại theo feedback', acceptsPrompt: true },
  { command: '/figma regenerate', label: 'Figma bản mới', detail: 'Tạo lại thiết kế, giữ bản cũ' },
  { command: '/figma status', label: 'Figma status', detail: 'Plugin, target và guard' },
  { command: '/help', label: 'Trợ giúp', detail: 'Toàn bộ lệnh (gồm nâng cao)' },
]

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

function threadModeLabel(thread: ThreadSummary): string {
  return thread.collaborationMode === 'studio' ? 'Studio' : thread.phase
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
  // History is now a dialog (not an always-on sidebar); default closed so a fresh chat opens compact.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewer, setViewer] = useState<{ kind: 'backlog'; data: MockJiraPlan } | { kind: 'zdoc'; data: MockZdocPlan } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsProfile, setSettingsProfile] = useState<ProviderProfile | null>(null)
  const [figmaSetupOpen, setFigmaSetupOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pendingPaidProvider, setPendingPaidProvider] = useState<ProviderProfile | null>(null)
  const [figmaStatus, setFigmaStatus] = useState<FigmaSetupStatus | null>(null)
  const [devBridge, setDevBridge] = useState<DevBridgeStatus | null>(null)
  const [selection, setSelection] = useState<CanvasSelectionContext | undefined>()
  const [canvasContext, setCanvasContext] = useState<CanvasDocumentContext | undefined>()
  const [lifecycleWorkspace, setLifecycleWorkspace] = useState<LifecycleWorkspaceState | null>(null)
  const [promotionPreview, setPromotionPreview] = useState<CanvasPromotionPreview | null>(null)
  const [programBatch, setProgramBatch] = useState<{ id: number; requestId?: string; program: CanvasProgram; source: CanvasExecutionReceipt['source'] }>({ id: 0, program: noCanvasProgram, source: 'provider' })
  const [canvasSyncRequestId, setCanvasSyncRequestId] = useState(0)
  const [artifactProgress, setArtifactProgress] = useState<Partial<Record<PlannedAction['target'], ArtifactProgressEvent>>>({})
  const [artifactClock, setArtifactClock] = useState(Date.now())
  const [suggestions, setSuggestions] = useState<ConversationSuggestion[]>([])
  const activeThreadIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeThreadIdRef.current = activeThread?.id ?? null
  }, [activeThread?.id])

  const refreshThreads = useCallback(async (query = search) => {
    const next = await window.pmAgent.threads.list(query)
    setThreads(next)
    return next
  }, [search])

  const openThread = useCallback(async (threadId: string) => {
    activeThreadIdRef.current = threadId
    setLoading(true)
    setError(null)
    setSuggestions([])
    try {
      const [detail, workspace] = await Promise.all([
        window.pmAgent.threads.get(threadId),
        window.pmAgent.lifecycle.getWorkspace(threadId),
      ])
      if (activeThreadIdRef.current !== threadId) return
      setActiveThread(detail)
      setLifecycleWorkspace(workspace)
      setSelection(undefined)
      setCanvasContext(undefined)
      setPromotionPreview(null)
      setArtifactProgress({})
      setProgramBatch({ id: 0, program: noCanvasProgram, source: 'provider' })
    } catch (nextError) {
      if (activeThreadIdRef.current === threadId) setError(errorText(nextError))
    } finally {
      if (activeThreadIdRef.current === threadId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([window.pmAgent.threads.list(), window.pmAgent.providers.list(), window.pmAgent.figma.status()])
      .then(async ([initialThreads, initialProfiles, initialFigmaStatus]) => {
        setThreads(initialThreads)
        setProfiles(initialProfiles)
        setFigmaStatus(initialFigmaStatus)
        // Open a fresh chat by default (createThread reuses an existing empty thread, so this
        // never spams duplicates) — compact, extension-style entry instead of the last thread.
        await createThread()
      })
      .catch((nextError) => {
        setError(errorText(nextError))
        setLoading(false)
      })
  }, [openThread])

  useEffect(() => { void window.pmAgent.devBridge.status().then(setDevBridge).catch(() => setDevBridge(null)) }, [])

  useEffect(() => window.pmAgent.menu.onOpenSettings(() => setSettingsOpen(true)), [])

  useEffect(() => window.pmAgent.canvas.onExternalCommands((batch) => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [detail, workspace] = await Promise.all([
          window.pmAgent.threads.get(batch.threadId),
          window.pmAgent.lifecycle.getWorkspace(batch.threadId),
        ])
        activeThreadIdRef.current = batch.threadId
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

  useEffect(() => window.pmAgent.lifecycle.onArtifactProgress((progress) => {
    if (activeThreadIdRef.current !== progress.threadId) return
    setArtifactProgress((current) => ({ ...current, [progress.target]: progress }))
    setArtifactClock(Date.now())
  }), [])

  useEffect(() => {
    const busy = Object.values(artifactProgress).some((progress) => progress?.status === 'running')
    if (!busy || !activeThread?.id) return
    const threadId = activeThread.id
    const timer = setInterval(() => {
      setArtifactClock(Date.now())
      void window.pmAgent.lifecycle.getWorkspace(threadId).then((workspace) => {
        if (activeThreadIdRef.current === threadId) setLifecycleWorkspace(workspace)
      }).catch(() => undefined)
    }, 500)
    return () => clearInterval(timer)
  }, [activeThread?.id, artifactProgress])

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
      activeThreadIdRef.current = detail.id
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
      else {
        activeThreadIdRef.current = null
        setActiveThread(null)
      }
    }
  }

  const commitRename = async (threadId: string): Promise<void> => {
    const title = renameDraft.trim()
    setRenamingId(null)
    if (!title) return
    try {
      const detail = await window.pmAgent.threads.rename(threadId, title)
      if (activeThread?.id === threadId) setActiveThread((current) => (current ? { ...current, title: detail.title } : current))
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    }
  }

  const openKickoffViewer = async (kind: 'backlog' | 'zdoc'): Promise<void> => {
    if (!activeThread) return
    try {
      if (kind === 'backlog') setViewer({ kind, data: await window.pmAgent.lifecycle.getBacklog(activeThread.id) })
      else setViewer({ kind, data: await window.pmAgent.lifecycle.getZdoc(activeThread.id) })
    } catch (nextError) {
      setError(errorText(nextError))
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
    canvasDiff?: CanvasDiffContext,
  ): Promise<void> => {
    if (!activeThread || runningThreadId || !content.trim()) return
    const requestThreadId = activeThread.id
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      threadId: requestThreadId,
      role: 'user',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }
    setActiveThread({ ...activeThread, messages: [...activeThread.messages, optimistic] })
    setRunningThreadId(requestThreadId)
    setSuggestions([])
    setError(null)
    try {
      const effectiveSelection = selectionOverride ?? selection
      const effectiveCanvas = canvasOverride ?? canvasContext
      const result = await window.pmAgent.chat.send({
        threadId: requestThreadId,
        content: content.trim(),
        ...(effectiveSelection ? { selection: effectiveSelection } : {}),
        ...(effectiveCanvas ? { canvas: effectiveCanvas } : {}),
        ...(canvasDiff ? { canvasDiff } : {}),
      })
      const [detail, workspace] = await Promise.all([
        window.pmAgent.threads.get(requestThreadId),
        window.pmAgent.lifecycle.getWorkspace(requestThreadId),
      ])
      if (activeThreadIdRef.current === requestThreadId) {
        setActiveThread(detail)
        setLifecycleWorkspace(workspace)
        setProgramBatch({
          id: Date.now(),
          ...(result.canvasRequestId ? { requestId: result.canvasRequestId } : {}),
          program: result.canvasProgram,
          source: result.canvasProgramSource === 'none' ? 'provider' : result.canvasProgramSource,
        })
        setSuggestions(result.suggestions)
      }
      if (isPromotionIntent(content) && canvasContext && canvasContext.shapes.length > 0) {
        const preview = await window.pmAgent.lifecycle.previewPromotion(requestThreadId, canvasContext)
        if (activeThreadIdRef.current === requestThreadId) setPromotionPreview(preview)
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
      const detail = await window.pmAgent.threads.get(requestThreadId)
      if (activeThreadIdRef.current === requestThreadId) setActiveThread(detail)
    } finally {
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const stopMessage = async (): Promise<void> => {
    if (!runningThreadId) return
    await window.pmAgent.chat.cancel(runningThreadId)
  }

  const startPromotion = async (): Promise<void> => {
    if (!activeThread || !canvasContext || canvasContext.shapes.length === 0) return
    try {
      const preview = await window.pmAgent.lifecycle.previewPromotion(activeThread.id, canvasContext)
      setPromotionPreview(preview)
    } catch (nextError) {
      setError(errorText(nextError))
    }
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
    const requestThreadId = activeThread.id
    setApproving(true)
    setRunningThreadId(requestThreadId)
    setError(null)
    try {
      const result = await window.pmAgent.lifecycle.approveChange(requestThreadId)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(result)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
      setRunningThreadId((current) => current === requestThreadId ? null : current)
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
    const requestThreadId = activeThread.id
    setApproving(true)
    setRunningThreadId(requestThreadId)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.commitPromotion(requestThreadId, promotionPreview.payloadHash)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setPromotionPreview(null)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const prepareArtifacts = async (): Promise<void> => {
    if (!activeThread || approving) return
    const requestThreadId = activeThread.id
    setApproving(true)
    setRunningThreadId(requestThreadId)
    setArtifactProgress({})
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.prepareArtifacts(requestThreadId)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const confirmProductSpec = async (): Promise<void> => {
    if (!activeThread || approving) return
    const requestThreadId = activeThread.id
    setApproving(true)
    setRunningThreadId(requestThreadId)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.confirmProductSpec(requestThreadId)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const advancePhase = async (): Promise<void> => {
    if (!activeThread || runningThreadId) return
    const requestThreadId = activeThread.id
    setRunningThreadId(requestThreadId)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.advancePhase(requestThreadId)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const regenerateArtifacts = async (feedback?: string): Promise<void> => {
    if (!activeThread || approving) return
    const requestThreadId = activeThread.id
    setApproving(true)
    setRunningThreadId(requestThreadId)
    setArtifactProgress({})
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.regenerateArtifacts(requestThreadId, feedback)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setApproving(false)
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const decideArtifacts = async (decision: 'approve' | 'reject'): Promise<void> => {
    if (!activeThread || approving) return
    setApproving(true)
    // Clear stale progress on BOTH decisions: a leftover 'running' entry would keep artifactBusy
    // true and lock the composer after "Hủy writes", stranding the user.
    setArtifactProgress({})
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
    if (!activeThread || runningThreadId) return
    const requestThreadId = activeThread.id
    setRunningThreadId(requestThreadId)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.advanceDecision(requestThreadId, answers)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const selectDecision = async (optionId: string, customTitle?: string): Promise<void> => {
    if (!activeThread || runningThreadId) return
    const requestThreadId = activeThread.id
    setRunningThreadId(requestThreadId)
    setError(null)
    try {
      const workspace = await window.pmAgent.lifecycle.selectDecision(requestThreadId, optionId, customTitle)
      if (activeThreadIdRef.current === requestThreadId) {
        setLifecycleWorkspace(workspace)
        setActiveThread(await window.pmAgent.threads.get(requestThreadId))
      }
      await refreshThreads()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setRunningThreadId((current) => current === requestThreadId ? null : current)
    }
  }

  const activeProfile = profiles.find((profile) => profile.id === activeThread?.providerId)
  const classifiedError = error ? classifyErrorText(error) : null

  const resetDemo = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.pmAgent.demo.reset()
      setSearch('')
      activeThreadIdRef.current = result.thread.id
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
    <div className="app-frame">
      <div className="app-titlebar"><span>ZA-ai-hackathon-26 — DualMind</span></div>
      <main className="app-shell">
      <section className="center-panel">
        <header className="topbar">
          <div className="thread-heading">
            {renamingId === activeThread?.id && activeThread ? (
              <input
                className="thread-rename-input"
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={() => void commitRename(activeThread.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitRename(activeThread.id)
                  if (event.key === 'Escape') setRenamingId(null)
                }}
              />
            ) : (
              <button
                className="thread-title-button"
                disabled={!activeThread}
                title={activeThread ? 'Đổi tên hội thoại' : undefined}
                onClick={() => { if (activeThread) { setRenameDraft(activeThread.title); setRenamingId(activeThread.id) } }}
              >
                <strong>{activeThread?.title ?? 'DualMind'}</strong>
                {activeThread && <Pencil size={13} className="rename-hint" />}
              </button>
            )}
            <span>{activeThread ? (activeThread.collaborationMode === 'studio' ? 'Studio · tự do khám phá' : `Phase · ${activeThread.phase}`) : 'Tạo thread để bắt đầu'}</span>
          </div>
          <div className="provider-controls">
            <span className={activeProfile?.hasCredential ? 'status-dot ready' : 'status-dot'} />
            <select
              aria-label="Reasoning provider"
              value={activeThread?.providerId ?? ''}
              disabled={!activeThread || Boolean(runningThreadId)}
              onChange={(event) => void switchProvider(event.target.value)}
            >
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
            </select>
            <span className="model-label">{activeProfile?.modelId ?? 'No provider'}</span>
            {devBridge?.running && (
              <span
                className="integration-button connected dev-bridge-chip"
                title={`AI Canvas: Dev Canvas Bridge đang chạy tại 127.0.0.1:${devBridge.port}. Claude Code / Codex trên máy này có thể vẽ workflow lên canvas qua skill "${devBridge.skill.id}" (${devBridge.skill.status}).`}
                aria-label="AI Canvas bridge đang chạy"
              >
                <Bot size={16} />
                <i />
              </span>
            )}
            <button
              className={figmaStatus?.target && figmaStatus.designSystem?.mode === 'live' ? 'integration-button connected' : 'integration-button'}
              aria-label="Figma integration"
              title="Figma integration"
              onClick={() => setFigmaSetupOpen(true)}
            >
              <Cable size={17} />
              <span>Figma</span>
              <i />
            </button>
            <button className="icon-button settings-open-button" title="Cài đặt" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        {classifiedError && (
          <div className="error-banner">
            <CircleAlert size={17} />
            <div className="error-copy">
              <strong>{classifiedError.title}</strong>
              <span>{classifiedError.contract} · {classifiedError.detail}</span>
              <small>{classifiedError.nextAction}</small>
            </div>
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
                syncRequestId={canvasSyncRequestId}
                agentBusy={runningThreadId === activeThread.id}
                onContextChange={(context, nextSelection) => {
                  setCanvasContext(context)
                  setSelection(nextSelection)
                }}
                onExecution={async (receipt) => {
                  await window.pmAgent.canvas.recordExecution(receipt)
                  if (activeThread?.id === receipt.threadId) {
                    setActiveThread(await window.pmAgent.threads.get(receipt.threadId))
                    setSuggestions(programBatch.program.sceneType === 'prototype'
                      ? [
                          { id: 'review-screen', label: 'Review một màn', prompt: 'Hãy critique màn hình tôi đang chọn và chỉ ra điểm cần refine', kind: 'refine' },
                          { id: 'check-edge-cases', label: 'Thêm trạng thái lỗi', prompt: 'Hãy đề xuất các trạng thái lỗi và recovery còn thiếu trước khi sửa canvas', kind: 'explore' },
                        ]
                      : [
                          { id: 'challenge-flow', label: 'Phản biện flow', prompt: 'Hãy phản biện flow vừa vẽ: điểm mù, nhánh lỗi và giả định nào còn yếu?', kind: 'explore' },
                          { id: 'refine-selection', label: 'Sửa vùng chọn', prompt: 'Hãy sửa đúng vùng canvas tôi đang chọn theo feedback tiếp theo', kind: 'refine' },
                        ])
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
                onSync={async (context, nextSelection, diff) => {
                  await sendMessage(
                    nextSelection
                      ? `Sync canvas. Hãy đọc thay đổi và phản hồi về vùng đang chọn: ${nextSelection.label}`
                      : 'Sync canvas. Hãy đọc các thay đổi tôi vừa thực hiện và tóm tắt tác động.',
                    context,
                    nextSelection,
                    diff,
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
        suggestions={suggestions}
        hasEarlierMessages={Boolean(activeThread?.messageNextCursor)}
        selection={selection}
        sending={runningThreadId === activeThread?.id}
        blockedByOtherThread={Boolean(runningThreadId && runningThreadId !== activeThread?.id)}
        approving={approving}
        artifactProgress={artifactProgress}
        artifactClock={artifactClock}
        preview={lifecycleWorkspace?.preview ?? undefined}
        clarification={lifecycleWorkspace?.runState.pendingClarification ?? undefined}
        execution={lifecycleWorkspace?.execution ?? undefined}
        reasoning={lifecycleWorkspace?.reasoning ?? undefined}
        productSpec={lifecycleWorkspace?.runState.productSpec}
        phase={lifecycleWorkspace?.runState.phase}
        collaborationMode={activeThread?.collaborationMode}
        deliveryActive={lifecycleWorkspace?.runState.phase === 'DELIVERY' && lifecycleWorkspace.runState.status === 'ACTIVE'}
        canvasItemCount={canvasContext?.shapes.filter((shape) => shape.semanticId && shape.nodeKind).length ?? 0}
        onStartPromotion={startPromotion}
        onSyncCanvas={() => setCanvasSyncRequestId((value) => value + 1)}
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
        onAdvancePhase={advancePhase}
        onSelectDecision={selectDecision}
        onCommitPromotion={commitPromotion}
        onCancelPromotion={() => setPromotionPreview(null)}
        onConfirmProductSpec={confirmProductSpec}
        onPrepareArtifacts={prepareArtifacts}
        onRegenerateArtifacts={regenerateArtifacts}
        onApproveArtifacts={() => decideArtifacts('approve')}
        onRejectArtifacts={() => decideArtifacts('reject')}
        onShowDocument={async () => {
          if (activeThread) await window.pmAgent.lifecycle.showDocument(activeThread.id)
        }}
        onShowBacklog={() => openKickoffViewer('backlog')}
        onShowZdoc={() => openKickoffViewer('zdoc')}
        onOpenHistory={() => setHistoryOpen(true)}
        onNewChat={() => void createThread()}
        onExport={async () => {
          if (!activeThread) return
          try {
            await window.pmAgent.threads.exportBundle(activeThread.id)
          } catch (nextError) {
            setError(errorText(nextError))
          }
        }}
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
          onAllowTarget={async (sessionId, useDesignSystem) => setFigmaStatus(await window.pmAgent.figma.allowTarget(sessionId, useDesignSystem))}
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

      {historyOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
          <section className="history-dialog" role="dialog" aria-modal="true" aria-label="Lịch sử hội thoại" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div className="figma-dialog-title"><History size={20} /><div><strong>Lịch sử hội thoại</strong><span>Chọn để mở · đổi tên · lưu trữ</span></div></div>
              <button className="icon-button" title="Đóng" onClick={() => setHistoryOpen(false)}><X size={18} /></button>
            </header>
            <button className="new-thread-button" onClick={() => { setHistoryOpen(false); void createThread() }}>
              <Plus size={17} /> Cuộc hội thoại mới
            </button>
            <label className="search-field">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm hội thoại" />
            </label>
            <div className="thread-list">
              {threads.map((thread) => (
                <div data-thread-id={thread.id} className={thread.id === activeThread?.id ? 'thread-row active' : 'thread-row'} key={thread.id}>
                  {renamingId === thread.id ? (
                    <input
                      className="thread-rename-input"
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => void commitRename(thread.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitRename(thread.id)
                        if (event.key === 'Escape') setRenamingId(null)
                      }}
                    />
                  ) : (
                    <button className="thread-main" onClick={() => { setHistoryOpen(false); void openThread(thread.id) }}>
                      <strong>{thread.title}</strong>
                      <span>{thread.lastMessage ?? 'Canvas trống'}</span>
                      <small>{thread.id === runningThreadId ? 'Đang reasoning' : threadModeLabel(thread)} · {relativeTime(thread.updatedAt)}</small>
                    </button>
                  )}
                  {renamingId !== thread.id && (
                    <div className="thread-actions">
                      <button className="thread-action-button" title="Đổi tên" onClick={() => { setRenameDraft(thread.title); setRenamingId(thread.id) }}>
                        <Pencil size={14} />
                      </button>
                      <button className="thread-action-button" title="Lưu trữ" onClick={() => void archiveThread(thread.id)}>
                        <Archive size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {threads.length === 0 && <div className="thread-empty">Chưa có hội thoại nào.</div>}
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <SettingsDialog
          profiles={profiles}
          activeProfile={activeProfile}
          figmaConnected={Boolean(figmaStatus?.target && figmaStatus.designSystem?.mode === 'live')}
          onClose={() => setSettingsOpen(false)}
          onConfigureProfile={(profile) => { setSettingsOpen(false); setSettingsProfile(profile) }}
          onOpenFigma={() => { setSettingsOpen(false); setFigmaSetupOpen(true) }}
          onResetDemo={() => { setSettingsOpen(false); setResetOpen(true) }}
        />
      )}

      {viewer && (
        <KickoffViewer
          viewer={viewer}
          onClose={() => setViewer(null)}
          onOpenFile={async () => {
            if (!activeThread) return
            try {
              if (viewer.kind === 'backlog') await window.pmAgent.lifecycle.showBacklog(activeThread.id)
              else await window.pmAgent.lifecycle.showZdoc(activeThread.id)
            } catch (nextError) {
              setError(errorText(nextError))
            }
          }}
        />
      )}
      </main>
    </div>
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
  onAllowTarget(sessionId: string, useDesignSystem: boolean): Promise<void>
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
  const freeTarget = status?.target?.creativeMode === 'free'
  const integrationReady = Boolean(
    status?.target
    && (freeTarget || (status.designSystem?.mode === 'live' && status.designSystem.componentCount > 0)),
  )

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
              <strong>{status?.target ? freeTarget ? 'Page vẽ live đã chọn' : 'Nguồn ZDS đã allowlist' : 'Xác nhận cách dùng Page'}</strong>
              <small>{status?.target
                ? `${status.target.fileName} · ${status.target.pageName}`
                : 'Mở Page component ZDS để guard, hoặc mở Page trống để agent vẽ free-creative.'}</small>
            </div>
            {status?.pluginConnected && activeSession && (
              <div className="figma-target-actions">
                <button className="allow-target-button" disabled={busy} onClick={() => void run(() => onAllowTarget(activeSession.sessionId, true))}>
                  <ShieldCheck size={14} /> {status?.target && !freeTarget ? 'Đổi ZDS sang Page đang mở' : 'Dùng ZDS'}
                </button>
                <button className="secondary-button no-zds-button" disabled={busy} onClick={() => void run(() => onAllowTarget(activeSession.sessionId, false))}>
                  Không dùng ZDS
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="manifest-path"><span>manifest.json</span><code>{status?.manifestPath ?? 'Đang xác định đường dẫn...'}</code></div>
        {status?.designSystem && (
          <div className={status.designSystem.mode === 'live' ? 'ds-context-status live' : 'ds-context-status fallback'}>
            <ShieldCheck size={18} />
            <div>
              <strong>{freeTarget ? 'Figma live · free creative' : status.designSystem.mode === 'live' ? 'Live Design System context' : 'Synthetic fixture guard'}</strong>
              <span>{status.designSystem.componentCount} components · {status.designSystem.iconCount} icons · {status.designSystem.tokenCount} tokens · {status.designSystem.fingerprint.slice(0, 12)}</span>
              {status.designSystem.fallbackReason && <small>{status.designSystem.fallbackReason}</small>}
            </div>
            {!freeTarget && (
              <button className="icon-button" disabled={busy} title="Đọc lại Design System" onClick={() => void run(onRefreshDesignSystem)}>
                <RefreshCw className={busy ? 'spin' : ''} size={16} />
              </button>
            )}
          </div>
        )}
        {status?.warnings?.map((warning) => (
          <div key={warning} className="figma-operation-warning"><CircleAlert size={15} /> {warning}</div>
        ))}
        {operationError && <div className="figma-operation-error"><CircleAlert size={15} /> {operationError}</div>}
        <footer>
          <span className={integrationReady ? 'figma-ready-label ready' : 'figma-ready-label'}>
            {integrationReady ? <CheckCircle2 size={15} /> : <LoaderCircle size={15} />}
            {integrationReady ? freeTarget ? 'Sẵn sàng vẽ live không ZDS' : 'Sẵn sàng cho preflight' : status?.pluginConnected ? 'Chờ allowlist' : 'Đang chờ plugin'}
          </span>
          <button className="secondary-button" disabled={!runtimeReady || busy} onClick={() => void run(onOpenControlPlane)}>
            <ExternalLink size={14} /> Runtime console
          </button>
        </footer>
      </section>
    </div>
  )
}

const LIFECYCLE_STEPS = ['Ý tưởng', 'Khám phá', 'Quyết định', 'Delivery', 'Kickoff Figma'] as const

function LifecycleStepper({ phase, requirements, canvasItemCount, onStartPromotion, onAdvancePhase, canAdvance, busy }: {
  phase?: import('@pm-agent/domain').RunState['phase']
  requirements: number
  canvasItemCount: number
  onStartPromotion(): Promise<void>
  onAdvancePhase(): Promise<void>
  canAdvance: boolean
  busy: boolean
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const phaseIndex: Record<string, number> = { IDEA_INTAKE: 0, DISCOVERY: 1, DECISION: 2, DELIVERY: 3, CHANGE_IMPACT: 3 }
  const base = phase ? phaseIndex[phase] ?? 0 : 0
  const readyForFigma = phase === 'DELIVERY' && requirements > 0
  const activeIndex = readyForFigma ? 4 : base
  // Deterministic wizard "next step" — host-controlled, so a thread never gets stuck waiting for
  // the LLM to volunteer a phase change. Only IDEA_INTAKE/DISCOVERY have a forward transition here;
  // Decision advances by picking an option, Delivery by creating the kickoff package.
  const advance = phase === 'IDEA_INTAKE'
    ? { label: 'Chốt ý tưởng → Khám phá', hint: 'Cần mô tả ý tưởng ít nhất một lần' }
    : phase === 'DISCOVERY'
      ? { label: 'Sang Quyết định (dùng giả định)', hint: '' }
      : null

  let hint = ''
  let action: { label: string; run(): Promise<void> } | null = null
  if (!phase || phase === 'IDEA_INTAKE') {
    if (canvasItemCount > 0) {
      hint = `Bạn đang khám phá tự do và đã vẽ ${canvasItemCount} node. Bản vẽ này chưa phải ProductSpec — để tạo Figma, hãy “chốt” nó thành ProductSpec trước.`
      action = { label: 'Chốt canvas → ProductSpec', run: onStartPromotion }
    } else {
      hint = 'Gửi ý tưởng của bạn — agent sẽ hỏi 3 câu Khám phá để làm rõ scope.'
    }
  } else if (phase === 'DISCOVERY') {
    hint = 'Trả lời các câu hỏi Khám phá bên dưới để agent tạo phương án.'
  } else if (phase === 'DECISION') {
    hint = 'Chọn một phương án MVP để agent tổng hợp ProductSpec.'
  } else if (phase === 'DELIVERY') {
    hint = requirements > 0
      ? 'Sẵn sàng tạo kickoff package: Figma + PRD.md + backlog. Bấm “Tạo kickoff package”.'
      : 'ProductSpec chưa có scope. Chốt canvas thành ProductSpec hoặc hoàn tất Quyết định trước.'
    if (requirements === 0 && canvasItemCount > 0) action = { label: 'Chốt canvas → ProductSpec', run: onStartPromotion }
  } else if (phase === 'CHANGE_IMPACT') {
    hint = 'Xem before/after và duyệt thay đổi.'
  }

  return (
    <section className={collapsed ? 'lifecycle-stepper collapsed' : 'lifecycle-stepper'} aria-label="Tiến trình lifecycle">
      <button className="stepper-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
        <span className="stepper-toggle-label">Bước {activeIndex + 1}/{LIFECYCLE_STEPS.length} · {LIFECYCLE_STEPS[activeIndex]}</span>
        {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {!collapsed && (
        <>
          <ol className="stepper-track">
            {LIFECYCLE_STEPS.map((label, index) => (
              <li key={label} className={index === activeIndex ? 'current' : index < activeIndex ? 'done' : 'todo'}>
                <span className="stepper-dot">{index < activeIndex ? '✓' : index + 1}</span>
                <span className="stepper-label">{label}</span>
              </li>
            ))}
          </ol>
          {hint && (
            <div className="stepper-hint">
              <span>{hint}</span>
              {action && (
                <button className="stepper-action" disabled={busy} onClick={() => void action!.run()}>{action.label}</button>
              )}
            </div>
          )}
          {advance && (
            <div className="stepper-nav">
              <button
                className="stepper-advance"
                disabled={busy || !canAdvance}
                title={!canAdvance ? advance.hint : undefined}
                onClick={() => void onAdvancePhase()}
              >
                {advance.label} <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ChatPanel({
  messages,
  suggestions,
  hasEarlierMessages,
  selection,
  sending,
  blockedByOtherThread,
  approving,
  artifactProgress,
  artifactClock,
  preview,
  clarification,
  execution,
  reasoning,
  productSpec,
  phase,
  collaborationMode,
  deliveryActive,
  canvasItemCount,
  promotionPreview,
  artifactActions,
  disabled,
  onSend,
  onStartPromotion,
  onSyncCanvas,
  onStop,
  onLoadEarlier,
  onApprove,
  onReject,
  onRetry,
  onAdvanceDecision,
  onAdvancePhase,
  onSelectDecision,
  onCommitPromotion,
  onCancelPromotion,
  onConfirmProductSpec,
  onPrepareArtifacts,
  onRegenerateArtifacts,
  onApproveArtifacts,
  onRejectArtifacts,
  onShowDocument,
  onShowBacklog,
  onShowZdoc,
  onExport,
  onOpenHistory,
  onNewChat,
}: {
  messages: ChatMessage[]
  suggestions: ConversationSuggestion[]
  hasEarlierMessages: boolean
  selection?: CanvasSelectionContext
  sending: boolean
  blockedByOtherThread: boolean
  approving: boolean
  artifactProgress: Partial<Record<PlannedAction['target'], ArtifactProgressEvent>>
  artifactClock: number
  preview?: ChangePreview
  clarification?: string
  execution?: ExecutionSummary
  reasoning?: PhaseReasoningResult
  productSpec?: import('@pm-agent/domain').ProductSpec
  phase?: import('@pm-agent/domain').RunState['phase']
  collaborationMode?: 'studio' | 'lifecycle'
  deliveryActive: boolean
  canvasItemCount: number
  promotionPreview?: CanvasPromotionPreview
  artifactActions: PlannedAction[]
  disabled: boolean
  onSend(content: string): Promise<void>
  onStartPromotion(): Promise<void>
  onSyncCanvas(): void
  onStop(): Promise<void>
  onLoadEarlier(): Promise<void>
  onApprove(): Promise<void>
  onReject(): Promise<void>
  onRetry(target: PlannedAction['target']): Promise<void>
  onAdvanceDecision(answers: Record<string, string>): Promise<void>
  onAdvancePhase(): Promise<void>
  onSelectDecision(optionId: string, customTitle?: string): Promise<void>
  onCommitPromotion(): Promise<void>
  onCancelPromotion(): void
  onConfirmProductSpec(): Promise<void>
  onPrepareArtifacts(): Promise<void>
  onRegenerateArtifacts(feedback?: string): Promise<void>
  onApproveArtifacts(): Promise<void>
  onRejectArtifacts(): Promise<void>
  onShowDocument(): Promise<void>
  onShowBacklog(): Promise<void>
  onShowZdoc(): Promise<void>
  onExport(): Promise<void>
  onOpenHistory(): void
  onNewChat(): void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [specOverviewOpen, setSpecOverviewOpen] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const artifactBusy = Object.values(artifactProgress).some((progress) => progress?.status === 'running')
  const canSend = !disabled && !sending && !approving && !artifactBusy && !blockedByOtherThread && draft.trim().length > 0
  const figmaAction = artifactActions.find((action) => action.target === 'figma')
  const artifactBriefEntries = artifactActions
    .map((action) => ({ action, brief: artifactBriefForAction(action) }))
    .filter((entry): entry is { action: PlannedAction; brief: NonNullable<ReturnType<typeof artifactBriefForAction>> } => Boolean(entry.brief))
  const figmaTimeoutMinutes = typeof figmaAction?.payload.timeoutBudgetMs === 'number'
    ? Math.ceil(figmaAction.payload.timeoutBudgetMs / 60_000)
    : null
  const figmaPlan = figmaAction?.payload.plan as {
    creativeBlueprint?: { screens?: Array<{ elements?: unknown[] }> }
  } | undefined
  const creativeScreens = figmaPlan?.creativeBlueprint?.screens ?? []
  const creativeLayers = creativeScreens.reduce((sum, screen) => sum + (screen.elements?.length ?? 0), 0)
  const figmaOnlyReapproval = artifactActions.length === 1 && artifactActions[0]?.target === 'figma'
  const slashQuery = draft.trimStart().toLowerCase()
  const matchingSlashCommands = slashQuery.startsWith('/') && !slashQuery.includes('\n')
    ? slashCommands.filter((item) => item.command.startsWith(slashQuery) || item.label.toLowerCase().includes(slashQuery.slice(1)))
    : []
  const selectedSlashCommand = matchingSlashCommands[Math.min(slashIndex, Math.max(0, matchingSlashCommands.length - 1))]
  const canvasCollaboration = canvasCollaborationCopy({
    canvasItemCount,
    selectionLabel: selection?.label,
    productSpecStatus: productSpec?.status,
    canPromote: canvasItemCount > 0 && (!productSpec || productSpec.requirements.filter((item) => item.status !== 'removed').length === 0),
  })
  const stateReceipt = workflowStateReceipt({
    productSpec,
    preview,
    execution,
    artifactActions,
    canvasItemCount,
    sending,
    artifactBusy,
  })

  const chooseSlashCommand = (item: typeof slashCommands[number]): void => {
    setDraft(`${item.command}${item.acceptsPrompt ? ' ' : ''}`)
    setSlashIndex(0)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const submit = async (): Promise<void> => {
    if (!canSend) return
    const content = draft
    setDraft('')
    await onSend(content)
  }

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <div><strong>Chat</strong><span>Product co-creation</span></div>
        <button className="icon-button chat-new-button" title="Cuộc hội thoại mới" onClick={onNewChat}>
          <Plus size={16} />
        </button>
        <button className="icon-button" title="Lịch sử hội thoại" onClick={onOpenHistory}>
          <History size={16} />
        </button>
        <button className="icon-button chat-export-button" title="Xuất log và tài liệu" disabled={disabled} onClick={() => void onExport()}>
          <Download size={16} />
        </button>
        <CheckCircle2 size={18} className="verified-icon" />
      </div>
      <LifecycleStepper
        phase={phase}
        requirements={productSpec?.requirements.filter((item) => item.status !== 'removed').length ?? 0}
        canvasItemCount={canvasItemCount}
        onStartPromotion={onStartPromotion}
        onAdvancePhase={onAdvancePhase}
        canAdvance={phase === 'IDEA_INTAKE' ? messages.some((message) => message.role === 'user') : phase === 'DISCOVERY'}
        busy={sending || approving}
      />
      {productSpec && (productSpec.requirements.length > 0 || productSpec.screens.length > 0 || productSpec.stories.length > 0) && (
        <ProductSpecInspector productSpec={productSpec} selection={selection} onOpen={() => setSpecOverviewOpen(true)} />
      )}
      <WorkflowStateReceiptPanel receipt={stateReceipt} />
      {specOverviewOpen && productSpec && (
        <ProductSpecOverview productSpec={productSpec} onClose={() => setSpecOverviewOpen(false)} />
      )}
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
        {!sending && suggestions.length > 0 && (
          <div className="conversation-suggestions" aria-label="Gợi ý tiếp tục">
            {suggestions.map((suggestion) => (
              <button key={suggestion.id} type="button" disabled={disabled} onClick={() => void onSend(suggestion.prompt)}>
                <Sparkles size={14} />
                <span>{suggestion.label}</span>
              </button>
            ))}
          </div>
        )}
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
          <header><strong>{figmaOnlyReapproval ? 'Rebind Figma' : 'Kickoff package'}</strong><span>Immutable preflight</span></header>
          <div className="artifact-targets">
            {artifactActions.map((action) => <span key={action.id}>{action.target === 'jira' ? 'Backlog mock' : action.target === 'zdoc' ? 'PRD.md' : 'Figma'}</span>)}
          </div>
          {artifactBriefEntries.length > 0 && (
            <div className="artifact-brief-list" aria-label="Kickoff artifact briefs">
              <strong>Kickoff contracts</strong>
              {artifactBriefEntries.map(({ action, brief }) => (
                <div className="artifact-brief-card" key={action.id}>
                  <div className="artifact-brief-title">
                    <b>{artifactTargetLabel(action.target)}</b>
                    <span>ArtifactBrief</span>
                  </div>
                  <div className="artifact-brief-facts">
                    {artifactBriefFacts(brief).map((fact) => <span key={fact}>{fact}</span>)}
                  </div>
                  <small>
                    ProductSpec v{brief.sourceSpecVersion} · hash {brief.sourcePayloadHash.slice(0, 10)} · write sau approval + read-back.
                  </small>
                </div>
              ))}
            </div>
          )}
          <small>
            Figma được guard và read-back; ưu tiên Page mới, chỉ dùng lại Page PM cùng sản phẩm khi Figma chạm giới hạn
            {creativeScreens.length > 0 ? ` · guarded scaffold ${creativeScreens.length} màn hình/${creativeLayers} lớp` : ''}
            {figmaTimeoutMinutes ? ` · tổng budget tối đa ${figmaTimeoutMinutes} phút cho scaffold + craft` : ''}.
            {' '}{figmaOnlyReapproval
              ? 'Chỉ payload Figma được thay mới; PRD và backlog đã verified được giữ nguyên.'
              : 'PRD được xuất local; backlog vẫn là mock cho tới khi có MCP.'}
          </small>
          <footer>
            <button className="secondary-button" disabled={approving} onClick={() => void onRejectArtifacts()}>Hủy writes</button>
            <button className="primary-button" disabled={approving || artifactBusy} onClick={() => void onApproveArtifacts()}>
              {approving || artifactBusy ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}
              {approving || artifactBusy ? 'Đang tạo...' : 'Duyệt & tạo'}
            </button>
          </footer>
        </section>
      )}
      {clarification && !preview && (
        <section className="ambiguity-panel" aria-label="Change clarification required">
          <CircleAlert size={18} />
          <div><strong>Cần xác định target</strong><span>{clarification}</span></div>
        </section>
      )}
      {(execution || artifactBusy) && (
        <ExecutionPanel
          execution={execution}
          progress={artifactProgress}
          clock={artifactClock}
          busy={approving || artifactBusy}
          onRetry={onRetry}
          onShowDocument={onShowDocument}
          onShowBacklog={onShowBacklog}
          onShowZdoc={onShowZdoc}
          onRegenerate={onRegenerateArtifacts}
        />
      )}
      {phase === 'IDEA_INTAKE' && collaborationMode !== 'studio' && !reasoning && !preview
        && messages.some((message) => message.role === 'user') && (
        <section className="discovery-starter" aria-label="Bắt đầu guided discovery">
          <div>
            <strong>Sẵn sàng dẫn dắt theo lựa chọn?</strong>
            <span>Khởi động guided discovery: khóa 3 clarification (có lựa chọn sẵn) rồi tạo phương án MVP để chọn.</span>
          </div>
          <button
            className="primary-button"
            disabled={sending || disabled}
            onClick={() => void onSend('bắt đầu discovery')}
          >
            {sending ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} Bắt đầu Discovery
          </button>
        </section>
      )}
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
          busy={sending || approving || artifactBusy}
          onSend={onSend}
          onConfirmProductSpec={onConfirmProductSpec}
          onPrepareArtifacts={onPrepareArtifacts}
        />
      )}
      {canvasCollaboration && (
        <CanvasCollaborationPanel
          copy={canvasCollaboration}
          busy={sending || approving || artifactBusy || blockedByOtherThread}
          onDraft={(prompt) => {
            setDraft(prompt)
            requestAnimationFrame(() => composerRef.current?.focus())
          }}
          onSync={onSyncCanvas}
          onPromote={onStartPromotion}
        />
      )}
      <div className="composer">
        {matchingSlashCommands.length > 0 && (
          <div className="slash-menu" role="listbox" aria-label="Slash commands">
            {matchingSlashCommands.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={item === selectedSlashCommand}
                className={item === selectedSlashCommand ? 'selected' : ''}
                key={item.command}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSlashCommand(item)}
              >
                <SquareTerminal size={15} />
                <span><strong>{item.command}</strong><small>{item.detail}</small></span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={composerRef}
          value={draft}
          disabled={disabled || approving || artifactBusy || blockedByOtherThread}
          placeholder={blockedByOtherThread
            ? 'Một thread khác đang reasoning...'
            : artifactBusy || approving
              ? 'Design agent đang xử lý artifact...'
              : 'Nhập ý tưởng hoặc điều khiển canvas...'}
          onChange={(event) => {
            setDraft(event.target.value)
            setSlashIndex(0)
          }}
          onKeyDown={(event) => {
            if (matchingSlashCommands.length > 0 && event.key === 'ArrowDown') {
              event.preventDefault()
              setSlashIndex((current) => (current + 1) % matchingSlashCommands.length)
              return
            }
            if (matchingSlashCommands.length > 0 && event.key === 'ArrowUp') {
              event.preventDefault()
              setSlashIndex((current) => (current - 1 + matchingSlashCommands.length) % matchingSlashCommands.length)
              return
            }
            if (selectedSlashCommand && event.key === 'Tab') {
              event.preventDefault()
              chooseSlashCommand(selectedSlashCommand)
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (selectedSlashCommand && draft.trim() !== selectedSlashCommand.command) {
                chooseSlashCommand(selectedSlashCommand)
                return
              }
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

function WorkflowStateReceiptPanel({ receipt }: { receipt: WorkflowStateReceipt }): React.JSX.Element {
  return (
    <section className={`workflow-state-receipt ${receipt.tone}`} aria-label="Workflow state receipt">
      <header>
        <ListChecks size={15} />
        <div>
          <strong>{receipt.title}</strong>
          <span>{receipt.status}</span>
        </div>
      </header>
      <div className="workflow-state-facts">
        {receipt.facts.slice(0, 2).map((fact) => <span key={fact}>{fact}</span>)}
      </div>
      <div className="workflow-state-next">
        {receipt.nextActions.slice(0, 2).map((action) => <small key={action}>{action}</small>)}
      </div>
    </section>
  )
}

function DeliveryGuide({
  productSpec,
  canvasItemCount,
  busy,
  onSend,
  onConfirmProductSpec,
  onPrepareArtifacts,
}: {
  productSpec: import('@pm-agent/domain').ProductSpec
  canvasItemCount: number
  busy: boolean
  onSend(content: string): Promise<void>
  onConfirmProductSpec(): Promise<void>
  onPrepareArtifacts(): Promise<void>
}): React.JSX.Element {
  const readiness = productSpecReadiness(productSpec)
  const requirements = readiness.metrics.find((item) => item.label === 'Req')?.value ?? 0
  const confirmed = productSpec.status === 'approved'
  return (
    <section className="delivery-guide" aria-label="Delivery next steps">
      <header>
        <div>
          <strong>{productSpec.status === 'draft' ? 'Draft ProductSpec workspace' : 'Delivery workspace'}</strong>
          <span>ProductSpec v{productSpec.version} · {readiness.truthLabel} · {readiness.surfaceLabel} · {readiness.artifactLabel}</span>
        </div>
        <CheckCircle2 size={17} />
      </header>
      <div className="delivery-status">
        {readiness.metrics.filter((item) => item.label !== 'Must').map((metric) => <span key={metric.label}><b>{metric.value}</b> {metric.label}</span>)}
        <span><b>{canvasItemCount}</b> Canvas</span>
      </div>
      <p>{confirmed
        ? 'AgentRouter/Codex có thể tạo Figma craft blueprint; Agent Core vẫn giữ approval, MCP write và read-back.'
        : 'Draft này cần được review/chốt trước khi tạo Figma, PRD.md và backlog mock từ cùng một source.'}</p>
      {readiness.blockers.length > 0 && (
        <div className="delivery-readiness blockers">
          <strong>Cần xử lý</strong>
          {readiness.blockers.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
      <div className="delivery-readiness actions">
        <strong>Tiếp theo</strong>
        {readiness.nextActions.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
      </div>
      <div className="delivery-actions">
        {!confirmed && (
          <button className="delivery-confirm-action" disabled={busy || requirements === 0} onClick={() => void onConfirmProductSpec()}>
            <ShieldCheck size={16} /><span><strong>Chốt ProductSpec</strong><small>Khóa source of truth</small></span>
          </button>
        )}
        <button disabled={busy} onClick={() => void onSend('Vẽ user flow MVP dựa trên phương án đã chọn')}>
          <Route size={16} /><span><strong>User flow</strong><small>Luồng và nhánh chính</small></span>
        </button>
        <button disabled={busy} onClick={() => void onSend('Tạo prototype các màn hình MVP dựa trên phương án đã chọn')}>
          <LayoutTemplate size={16} /><span><strong>Prototype</strong><small>3–5 màn hình chỉnh được</small></span>
        </button>
        <button disabled={busy} onClick={() => void onSend('Tiếp tục hoàn thiện ProductSpec: chỉ ra scope, giả định và điểm còn thiếu')}>
          <FileText size={16} /><span><strong>ProductSpec</strong><small>Bổ sung scope còn thiếu</small></span>
        </button>
        <button className="delivery-package-action" disabled={busy || !readiness.artifactReady} onClick={() => void onPrepareArtifacts()}>
          <FolderOpen size={16} /><span><strong>Tạo kickoff package</strong><small>Figma · PRD.md · backlog mock</small></span>
        </button>
      </div>
    </section>
  )
}

const PRIORITY_LABEL: Record<string, string> = { must: 'Must', should: 'Should', could: 'Could', wont: "Won't" }

function CanvasCollaborationPanel({
  copy,
  busy,
  onDraft,
  onSync,
  onPromote,
}: {
  copy: NonNullable<ReturnType<typeof canvasCollaborationCopy>>
  busy: boolean
  onDraft(prompt: string): void
  onSync(): void
  onPromote(): Promise<void>
}): React.JSX.Element {
  const run = (action: CanvasCollaborationAction): void => {
    if (action.id === 'sync-canvas') {
      onSync()
      return
    }
    if (action.id === 'promote-canvas') {
      void onPromote()
      return
    }
    if (action.draft) onDraft(action.draft)
  }
  const icon = (action: CanvasCollaborationAction): React.JSX.Element => {
    if (action.id === 'sync-canvas') return <RefreshCw size={14} />
    if (action.id === 'promote-canvas') return <ShieldCheck size={14} />
    if (action.id === 'refine-selection') return <Pencil size={14} />
    return <MessageSquareText size={14} />
  }

  return (
    <section className="canvas-collaboration-panel" aria-label="Canvas collaboration loop">
      <header>
        <div>
          <strong>{copy.title}</strong>
          <span>{copy.status}</span>
        </div>
      </header>
      <p>{copy.detail}</p>
      <div className="canvas-collaboration-actions">
        {copy.actions.map((action) => (
          <button type="button" key={action.id} disabled={busy} title={action.detail} onClick={() => run(action)}>
            {icon(action)}
            <span><strong>{action.label}</strong><small>{action.detail}</small></span>
          </button>
        ))}
      </div>
    </section>
  )
}

function ProductSpecOverview({
  productSpec,
  onClose,
}: {
  productSpec: import('@pm-agent/domain').ProductSpec
  onClose(): void
}): React.JSX.Element {
  const readiness = productSpecReadiness(productSpec)
  const activeRequirements = productSpec.requirements.filter((item) => item.status !== 'removed')
  const removedRequirements = productSpec.requirements.filter((item) => item.status === 'removed')
  const reqTitle = (id: string): string => productSpec.requirements.find((item) => item.id === id)?.title ?? id
  return (
    <div className="spec-overview-backdrop" role="dialog" aria-label="ProductSpec overview" onClick={onClose}>
      <div className="spec-overview" onClick={(event) => event.stopPropagation()}>
        <header className="spec-overview-head">
          <div>
            <strong>{productSpec.title}</strong>
            <span>ProductSpec v{productSpec.version} · {readiness.truthLabel} · {readiness.surfaceLabel.toUpperCase()}</span>
          </div>
          <button className="icon-button" title="Đóng" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="spec-overview-body">
          <section className={`spec-readiness ${readiness.artifactReady ? 'ready' : 'review'}`}>
            <div>
              <strong>{readiness.artifactLabel}</strong>
              <span>{readiness.artifactReady ? 'Có thể chuẩn bị Figma/PRD/backlog cùng ArtifactBrief.' : 'Chưa nên write artifact bên ngoài.'}</span>
            </div>
            <div className="spec-readiness-metrics">
              {readiness.metrics.map((metric) => <span key={metric.label}><b>{metric.value}</b>{metric.label}</span>)}
            </div>
            {readiness.blockers.length > 0 && (
              <ul>{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
            )}
          </section>
          <section className="spec-block">
            <h4>Ý tưởng</h4>
            <p>{productSpec.idea.summary}</p>
            <div className="spec-chips">{productSpec.idea.targetUsers.map((user) => <span key={user} className="spec-chip">{user}</span>)}</div>
          </section>
          {productSpec.goals.length > 0 && (
            <section className="spec-block">
              <h4>Mục tiêu ({productSpec.goals.length})</h4>
              <ul className="spec-list">{productSpec.goals.map((goal) => <li key={goal.id}>{goal.title}</li>)}</ul>
            </section>
          )}
          <section className="spec-block">
            <h4>Requirements ({activeRequirements.length})</h4>
            {activeRequirements.map((req) => (
              <div className="spec-entity" key={req.id}>
                <div className="spec-entity-head">
                  <span className="spec-id">{req.id}</span>
                  <span className={`spec-badge prio-${req.priority}`}>{PRIORITY_LABEL[req.priority]}</span>
                  <strong>{req.title}</strong>
                </div>
                <p>{req.description}</p>
                <ul className="spec-ac">{req.acceptanceCriteria.map((ac, index) => <li key={index}>{ac}</li>)}</ul>
              </div>
            ))}
            {removedRequirements.length > 0 && (
              <div className="spec-removed">Đã loại: {removedRequirements.map((req) => req.title).join(', ')}</div>
            )}
          </section>
          {productSpec.screens.length > 0 && (
            <section className="spec-block">
              <h4>Screens ({productSpec.screens.length})</h4>
              {productSpec.screens.map((screen) => (
                <div className="spec-entity" key={screen.id}>
                  <div className="spec-entity-head"><span className="spec-id">{screen.id}</span><strong>{screen.title}</strong></div>
                  <p>{screen.purpose}</p>
                  <div className="spec-chips">{screen.requirementIds.map((id) => <span key={id} className="spec-chip link" title={reqTitle(id)}>{id}</span>)}</div>
                </div>
              ))}
            </section>
          )}
          {productSpec.stories.length > 0 && (
            <section className="spec-block">
              <h4>User stories ({productSpec.stories.length})</h4>
              {productSpec.stories.map((story) => (
                <div className="spec-entity" key={story.id}>
                  <div className="spec-entity-head"><span className="spec-id">{story.id}</span><strong>{story.title}</strong></div>
                  <div className="spec-chips">{story.requirementIds.map((id) => <span key={id} className="spec-chip link" title={reqTitle(id)}>{id}</span>)}</div>
                </div>
              ))}
            </section>
          )}
          {productSpec.artifactMappings.length > 0 && (
            <section className="spec-block">
              <h4>Traceability → artifacts</h4>
              {productSpec.artifactMappings.map((mapping) => (
                <div className="spec-map" key={mapping.id}>
                  <span className={`spec-badge map-${mapping.status}`}>{mapping.target} · {mapping.status}</span>
                  <span className="spec-map-ids">{mapping.entityIds.join(', ')}</span>
                  {mapping.externalId && <span className="spec-map-ext">{mapping.externalId}</span>}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductSpecInspector({
  productSpec,
  selection,
  onOpen,
}: {
  productSpec: import('@pm-agent/domain').ProductSpec
  selection?: CanvasSelectionContext
  onOpen(): void
}): React.JSX.Element {
  const readiness = productSpecReadiness(productSpec)
  const selected = selection?.entityId
    ? [productSpec.idea, ...productSpec.goals, ...productSpec.findings, ...productSpec.requirements, ...productSpec.screens, ...productSpec.stories, ...productSpec.dependencies, ...productSpec.decisions]
      .find((entity) => entity.id === selection.entityId)
    : undefined
  return (
    <button className="spec-inspector" aria-label="Mở tổng quan ProductSpec" onClick={onOpen} title="Xem toàn bộ ProductSpec">
      <header>
        <strong>{productSpec.status === 'draft' ? 'Draft ProductSpec' : 'ProductSpec'} v{productSpec.version}</strong>
        <span className="spec-open-hint">{readiness.surfaceLabel} · {readiness.artifactLabel} <Maximize2 size={11} /></span>
      </header>
      <div className="spec-metrics">
        {readiness.metrics.filter((item) => item.label !== 'Must').map((metric) => <span key={metric.label}><b>{metric.value}</b> {metric.label}</span>)}
      </div>
      <div className={`spec-readiness-pill ${readiness.artifactReady ? 'ready' : 'review'}`}>
        {readiness.truthLabel} · {readiness.blockers[0] ?? 'Ready for artifact approval'}
      </div>
      {selected && <p><strong>{selected.id}</strong><span>{selected.title}</span></p>}
    </button>
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
  progress,
  clock,
  busy,
  onRetry,
  onShowDocument,
  onShowBacklog,
  onShowZdoc,
  onRegenerate,
}: {
  execution?: ExecutionSummary
  progress: Partial<Record<PlannedAction['target'], ArtifactProgressEvent>>
  clock: number
  busy: boolean
  onRetry(target: PlannedAction['target']): Promise<void>
  onShowDocument(): Promise<void>
  onShowBacklog(): Promise<void>
  onShowZdoc(): Promise<void>
  onRegenerate(feedback?: string): Promise<void>
}): React.JSX.Element {
  const labels: Record<PlannedAction['target'], string> = { figma: 'Figma', jira: 'Backlog mock', zdoc: 'PRD Markdown' }
  const stageLabels: Record<ArtifactProgressEvent['stage'], string> = {
    planning: 'ArtifactBrief + plan',
    availability: 'Kiểm tra kết nối',
    preflight: 'Guard preflight',
    write: 'Write có approval',
    read_back: 'Read-back',
    verify: 'Verify read-back',
    complete: 'Verified complete',
  }
  const actions = execution?.actions ?? (Object.keys(progress) as PlannedAction['target'][]).map((target) => ({
    actionId: `progress:${target}`,
    target,
    status: 'executing' as const,
    attempts: 1,
    lastError: null,
    receipt: null,
    verification: null,
  }))
  const status = execution?.status ?? 'executing'
  return (
    <section className={`execution-panel ${status}`} aria-label="Artifact execution status">
      <header>
        <div><strong>Artifact sync</strong><span>{status.replace('_', ' ')}</span></div>
        {status === 'verified' ? <CheckCircle2 size={18} /> : <GitCompareArrows size={18} />}
      </header>
      <div className="execution-list">
        {actions.map((action) => {
          const retryable = action.status === 'failed' || action.status === 'verification_failed'
          const live = progress[action.target]
          const elapsed = live
            ? live.totalElapsedMs + (live.status === 'running' ? Math.max(0, clock - new Date(live.at).getTime()) : 0)
            : 0
          return (
            <div className="execution-row" data-target={action.target} key={action.actionId}>
              {live?.status === 'running'
                ? <LoaderCircle className="spin execution-loader" size={14} />
                : <span className={`execution-state ${action.status}`} />}
              <div>
                <strong>{labels[action.target]}</strong>
                <small>
                  {live ? live.message : `${action.status.replace('_', ' ')} · attempt ${action.attempts}`}
                </small>
                {live && <small>{stageLabels[live.stage]} · {Math.ceil(elapsed / 1_000)}s</small>}
              </div>
              {retryable && (
                <button
                  className="icon-button"
                  data-retry-target={action.target}
                  disabled={busy}
                  title={`Retry ${labels[action.target]}`}
                  onClick={() => void onRetry(action.target)}
                >
                  <RefreshCw className={busy ? 'spin' : ''} size={15} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {execution?.status === 'verified' && (
        <div className="execution-actions">
          <button className="document-open-button" onClick={() => void onShowDocument()}>
            <FolderOpen size={15} /> Mở PRD.md
          </button>
          <button className="document-open-button" onClick={() => void onShowBacklog()}>
            <FolderOpen size={15} /> Mở backlog
          </button>
          <button className="document-open-button" onClick={() => void onShowZdoc()}>
            <FolderOpen size={15} /> Mở tài liệu Confluence
          </button>
          <button
            className="regenerate-button"
            disabled={busy}
            title="Tạo một bản Figma mới trên cùng scope; bản cũ vẫn được giữ. Muốn sửa có định hướng, gõ /figma refine [feedback]."
            onClick={() => void onRegenerate()}
          >
            <RefreshCw size={14} /> Tạo bản Figma mới
          </button>
        </div>
      )}
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
  const runtime = providerRuntimeCopy(profile)

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
          {profile.modelOptions?.length
            ? (
              <select value={modelId} onChange={(event) => setModelId(event.target.value)} aria-label="Provider model">
                {profile.modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            )
            : <input value={modelId} onChange={(event) => setModelId(event.target.value)} />}
        </label>
        {profile.modelOptions?.find((option) => option.id === modelId)?.detail && (
          <div className="privacy-note">{profile.modelOptions.find((option) => option.id === modelId)?.detail}</div>
        )}
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
        <div className="runtime-contract" aria-label="Provider runtime contract">
          <strong>Runtime contract</strong>
          <span>{runtime.role}</span>
          <span>{runtime.storage}</span>
          <span>{runtime.artifactBoundary}</span>
          <div className="runtime-tags">
            {runtime.tags.map((tag) => <i key={tag}>{tag}</i>)}
          </div>
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

function SettingsDialog({
  profiles,
  activeProfile,
  figmaConnected,
  onClose,
  onConfigureProfile,
  onOpenFigma,
  onResetDemo,
}: {
  profiles: ProviderProfile[]
  activeProfile: ProviderProfile | null | undefined
  figmaConnected: boolean
  onClose(): void
  onConfigureProfile(profile: ProviderProfile): void
  onOpenFigma(): void
  onResetDemo(): void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog app-settings-dialog" role="dialog" aria-modal="true" aria-label="Cài đặt" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="figma-dialog-title"><Settings size={20} /><div><strong>Cài đặt</strong><span>Provider · tích hợp · workspace</span></div></div>
          <button className="icon-button" title="Đóng" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="settings-section">
          <h4>Reasoning providers</h4>
          <div className="settings-provider-list">
            {profiles.map((profile) => {
              const runtime = providerRuntimeCopy(profile)
              return (
                <div key={profile.id} className={profile.id === activeProfile?.id ? 'settings-provider-row active' : 'settings-provider-row'}>
                  <span className={profile.hasCredential ? 'status-dot ready' : 'status-dot'} />
                  <div className="settings-provider-copy">
                    <strong>{profile.displayName}</strong>
                    <span>{profile.modelId} · {profile.costMode}{profile.id === activeProfile?.id ? ' · đang dùng' : ''}</span>
                    <small>{runtime.role}</small>
                  </div>
                  <button className="secondary-button" onClick={() => onConfigureProfile(profile)}>Cấu hình</button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="settings-section">
          <h4>Tích hợp</h4>
          <div className="settings-provider-row">
            <span className={figmaConnected ? 'status-dot ready' : 'status-dot'} />
            <div className="settings-provider-copy">
              <strong>Figma</strong>
              <span>{figmaConnected ? 'Đã kết nối · Live ZDS' : 'Chưa kết nối / mock'}</span>
            </div>
            <button className="secondary-button" onClick={onOpenFigma}>Mở setup</button>
          </div>
          <div className="settings-provider-row">
            <span className="status-dot" />
            <div className="settings-provider-copy">
              <strong>Jira / Confluence (Atlassian)</strong>
              <span>Đẩy trực tiếp qua REST — sắp có (đợt 2)</span>
            </div>
            <button className="secondary-button" disabled>Sắp có</button>
          </div>
        </div>

        <div className="settings-section">
          <h4>Workspace</h4>
          <div className="settings-provider-row">
            <RotateCcw size={16} />
            <div className="settings-provider-copy">
              <strong>Reset demo</strong>
              <span>Thay history/canvas/runs bằng fixture ban đầu</span>
            </div>
            <button className="secondary-button danger reset-demo-button" onClick={onResetDemo}>Reset</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function KickoffViewer({
  viewer,
  onClose,
  onOpenFile,
}: {
  viewer: { kind: 'backlog'; data: MockJiraPlan } | { kind: 'zdoc'; data: MockZdocPlan }
  onClose(): void
  onOpenFile(): Promise<void>
}): React.JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="kickoff-viewer" role="dialog" aria-modal="true" aria-label={viewer.kind === 'backlog' ? 'Phân rã task' : 'Tài liệu'} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="figma-dialog-title">
            {viewer.kind === 'backlog' ? <ListChecks size={20} /> : <FileText size={20} />}
            <div>
              <strong>{viewer.kind === 'backlog' ? 'Phân rã task (Jira backlog)' : 'Tài liệu (Confluence)'}</strong>
              <span>Xem lại trước khi export/đẩy MCP</span>
            </div>
          </div>
          <div className="kickoff-viewer-actions">
            <button className="secondary-button" onClick={() => void onOpenFile()}><FolderOpen size={14} /> Mở file .md</button>
            <button className="icon-button" title="Đóng" onClick={onClose}><X size={18} /></button>
          </div>
        </header>

        {viewer.kind === 'backlog' ? (
          <div className="kickoff-viewer-body">
            <div className="kickoff-epic"><span className="kickoff-tag">EPIC</span> {viewer.data.epic.title}</div>
            <div className="kickoff-stories">
              {viewer.data.stories.map((story) => (
                <div key={story.storyId} className={story.status === 'removed' ? 'kickoff-story removed' : 'kickoff-story'}>
                  <div className="kickoff-story-head">
                    <strong>{story.title}</strong>
                    <span className="kickoff-chip">{story.storyId}</span>
                    {story.status === 'removed' && <span className="kickoff-chip danger">đã gỡ</span>}
                  </div>
                  <div className="kickoff-req">Requirements: {story.requirementIds.join(', ') || '—'}</div>
                  {story.acceptanceCriteria.length > 0 && (
                    <ul className="kickoff-ac">
                      {story.acceptanceCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}
                    </ul>
                  )}
                </div>
              ))}
              {viewer.data.stories.length === 0 && <div className="thread-empty">Chưa có story nào — hãy promote canvas thành ProductSpec trước.</div>}
            </div>
          </div>
        ) : (
          <div className="kickoff-viewer-body">
            <h3 className="kickoff-doc-title">{viewer.data.title}</h3>
            <p className="kickoff-doc-summary">{viewer.data.summary}</p>
            {viewer.data.requirementSections.map((section) => (
              <div key={section.requirementId} className={section.status === 'removed' ? 'kickoff-section removed' : 'kickoff-section'}>
                <div className="kickoff-story-head">
                  <strong>{section.title}</strong>
                  <span className="kickoff-chip">{section.requirementId}</span>
                  <span className="kickoff-chip">{section.priority}</span>
                  {section.status === 'removed' && <span className="kickoff-chip danger">đã gỡ</span>}
                </div>
                <p className="kickoff-section-desc">{section.description}</p>
                {section.acceptanceCriteria.length > 0 && (
                  <ul className="kickoff-ac">
                    {section.acceptanceCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}
                  </ul>
                )}
                <div className="kickoff-req">Screens: {section.screenIds.join(', ') || '—'} · Stories: {section.storyIds.join(', ') || '—'}</div>
              </div>
            ))}
            {viewer.data.requirementSections.length === 0 && <div className="thread-empty">Chưa có nội dung — hãy promote canvas thành ProductSpec trước.</div>}
          </div>
        )}
      </section>
    </div>
  )
}
