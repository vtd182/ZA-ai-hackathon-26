import { useCallback, useEffect, useRef, useState } from 'react'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import {
  ArrowUpRight,
  CheckCircle2,
  CloudUpload,
  Crosshair,
  Eraser,
  Focus,
  LoaderCircle,
  MousePointer2,
  Pencil,
  ScanSearch,
  Square,
  StickyNote,
  Type,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react'
import {
  DefaultStylePanel,
  Tldraw,
  getSnapshot,
  useEditor,
  useValue,
  type Editor,
  type TLComponents,
  type TLStoreSnapshot,
  type TLUiStylePanelProps,
} from 'tldraw'
import type { CanvasDiffContext, CanvasDocumentContext, CanvasExecutionFailure, CanvasExecutionReceipt, CanvasProgram, CanvasSelectionContext } from '@pm-agent/domain'
import { diffCanvasContexts, executeCanvasProgram, inspectCanvas, reflowCanvas } from './canvas-service'

interface CanvasWorkspaceProps {
  threadId: string
  snapshot: unknown | null
  programBatch: { id: number; requestId?: string; program: CanvasProgram; source: CanvasExecutionReceipt['source'] }
  agentBusy: boolean
  onContextChange(context: CanvasDocumentContext, selection?: CanvasSelectionContext): void
  onExecution(receipt: CanvasExecutionReceipt): Promise<void>
  onExecutionError(failure: CanvasExecutionFailure): Promise<void>
  onSync(context: CanvasDocumentContext, selection: CanvasSelectionContext | undefined, diff: CanvasDiffContext): Promise<void>
  onError(message: string): void
}

const tldrawAssetUrls = getAssetUrlsByImport()

function ContextualStylePanel(props: TLUiStylePanelProps): React.JSX.Element | null {
  const editor = useEditor()
  const selectedShape = useValue(
    'selected shape for style panel',
    () => {
      const ids = editor.getSelectedShapeIds()
      return ids.length === 1 ? editor.getShape(ids[0]!) : null
    },
    [editor],
  )
  return selectedShape && selectedShape.meta.canvasOwner !== 'agent' ? <DefaultStylePanel {...props} /> : null
}

const canvasComponents: TLComponents = {
  Minimap: null,
  PageMenu: null,
  StylePanel: ContextualStylePanel,
  Toolbar: null,
}

const canvasTools = [
  { id: 'select', label: 'Chọn', Icon: MousePointer2 },
  { id: 'draw', label: 'Vẽ tự do', Icon: Pencil },
  { id: 'geo', label: 'Hình khối', Icon: Square },
  { id: 'note', label: 'Ghi chú', Icon: StickyNote },
  { id: 'text', label: 'Văn bản', Icon: Type },
  { id: 'arrow', label: 'Kết nối', Icon: ArrowUpRight },
  { id: 'eraser', label: 'Xóa nét', Icon: Eraser },
] as const

function selectionFromContext(context: CanvasDocumentContext): CanvasSelectionContext | undefined {
  if (context.selectedShapeIds.length === 0) return undefined
  const selected = context.shapes.filter((shape) => context.selectedShapeIds.includes(shape.id))
  const primary = selected[0]
  if (!primary) return undefined
  const selectedBounds = context.selectedBounds
  const nearby = selectedBounds
    ? context.shapes
        .filter((shape) => (
          context.selectedShapeIds.includes(shape.id)
          || (
            shape.x < selectedBounds.x + selectedBounds.width + 480
            && shape.x + shape.width > selectedBounds.x - 480
            && shape.y < selectedBounds.y + selectedBounds.height + 360
            && shape.y + shape.height > selectedBounds.y - 360
          )
        ))
        .sort((first, second) => {
          const firstSelected = context.selectedShapeIds.includes(first.id) ? 0 : 1
          const secondSelected = context.selectedShapeIds.includes(second.id) ? 0 : 1
          if (firstSelected !== secondSelected) return firstSelected - secondSelected
          const centerX = selectedBounds.x + selectedBounds.width / 2
          const centerY = selectedBounds.y + selectedBounds.height / 2
          const firstDistance = Math.hypot(first.x + first.width / 2 - centerX, first.y + first.height / 2 - centerY)
          const secondDistance = Math.hypot(second.x + second.width / 2 - centerX, second.y + second.height / 2 - centerY)
          return firstDistance - secondDistance
        })
    : selected
  return {
    entityId: primary.semanticId ?? primary.id,
    label: selected.map((shape) => shape.label || shape.semanticId || shape.type).slice(0, 3).join(' · '),
    shapeIds: selected.map((shape) => shape.id),
    selectedShapeCount: selected.length,
    contextItems: nearby.slice(0, 24).map((shape) => ({
      shapeId: shape.id,
      ...(shape.semanticId ? { entityId: shape.semanticId } : {}),
      type: shape.type,
      label: shape.label || shape.semanticId || shape.type,
    })),
  }
}

type CanvasActivityStage = 'idle' | 'reasoning' | 'applying' | 'checkpoint' | 'verifying' | 'verified' | 'error'

const activityCopy: Record<Exclude<CanvasActivityStage, 'idle'>, { title: string; detail: string; step: number }> = {
  reasoning: { title: 'Agent đang phân tích', detail: 'Đọc hội thoại, vùng chọn và scene hiện tại', step: 1 },
  applying: { title: 'Đang dựng scene', detail: 'Áp dụng Canvas Program trong một transaction', step: 2 },
  checkpoint: { title: 'Đang lưu checkpoint', detail: 'Ghi CanvasDocument vào local history', step: 3 },
  verifying: { title: 'Đang đọc lại', detail: 'Kiểm tra shape, binding và bố cục', step: 4 },
  verified: { title: 'Canvas đã đồng bộ', detail: 'Checkpoint và read-back đã hoàn tất', step: 4 },
  error: { title: 'Canvas chưa hoàn tất', detail: 'Transaction đã dừng trước khi xác nhận', step: 4 },
}

export function CanvasWorkspace({
  threadId,
  snapshot,
  programBatch,
  agentBusy,
  onContextChange,
  onExecution,
  onExecutionError,
  onSync,
  onError,
}: CanvasWorkspaceProps): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const lastProgram = useRef(0)
  const applyingProgram = useRef(false)
  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revision = useRef(0)
  const syncedContext = useRef<CanvasDocumentContext | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [sceneContext, setSceneContext] = useState<CanvasDocumentContext | null>(null)
  const [activeTool, setActiveTool] = useState('select')
  const [dirty, setDirty] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [activityStage, setActivityStage] = useState<CanvasActivityStage>('idle')

  const showActivity = useCallback((stage: CanvasActivityStage, clearAfter?: number) => {
    if (activityTimer.current) clearTimeout(activityTimer.current)
    setActivityStage(stage)
    if (clearAfter) activityTimer.current = setTimeout(() => setActivityStage('idle'), clearAfter)
  }, [])

  const emitContext = useCallback((editor: Editor): CanvasDocumentContext => {
    revision.current += 1
    const context = inspectCanvas(editor, revision.current)
    setSceneContext(context)
    setActiveTool(editor.getCurrentToolId())
    onContextChange(context, selectionFromContext(context))
    return context
  }, [onContextChange])

  const schedulePersistence = useCallback((editor: Editor) => {
    setSaveState('saving')
    if (!applyingProgram.current) setDirty(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.pmAgent.canvas.save(threadId, getSnapshot(editor.store)).then(() => setSaveState('saved'))
    }, 650)
    if (contextTimer.current) clearTimeout(contextTimer.current)
    contextTimer.current = setTimeout(() => emitContext(editor), 80)
  }, [emitContext, threadId])

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    // A subtle grid gives the workspace a design-tool feel without affecting shape state.
    editor.updateInstanceState({ isGridMode: true })
    setEditorEpoch((value) => value + 1)
    syncedContext.current = emitContext(editor)
    const stopDocument = editor.store.listen(() => schedulePersistence(editor), { scope: 'document' })
    const stopSession = editor.store.listen(() => emitContext(editor), { scope: 'session' })
    cleanup.current = () => { stopDocument(); stopSession() }
  }, [emitContext, schedulePersistence])

  useEffect(() => {
    if (agentBusy && !applyingProgram.current && !syncing) showActivity('reasoning')
    if (!agentBusy && activityStage === 'reasoning' && !syncing) showActivity('idle')
  }, [activityStage, agentBusy, showActivity, syncing])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || programBatch.id === 0 || programBatch.id === lastProgram.current || programBatch.program.mode === 'none') return
    lastProgram.current = programBatch.id
    applyingProgram.current = true
    setDirty(false)
    showActivity('applying')
    void executeCanvasProgram(editor, threadId, programBatch.program, programBatch.source, programBatch.requestId)
      .then(async (receipt) => {
        showActivity('checkpoint')
        await window.pmAgent.canvas.save(threadId, getSnapshot(editor.store))
        setSaveState('saved')
        syncedContext.current = emitContext(editor)
        showActivity('verifying')
        await onExecution({ ...receipt, batchId: programBatch.id })
        setDirty(false)
        showActivity('verified', 2_200)
      })
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Không thể áp dụng Canvas Program'
        if (programBatch.requestId) {
          await onExecutionError({
            schemaVersion: 1,
            requestId: programBatch.requestId,
            threadId,
            error: message,
            at: new Date().toISOString(),
          })
        }
        showActivity('error', 3_200)
        onError(message)
      })
      .finally(() => {
        applyingProgram.current = false
      })
  }, [editorEpoch, emitContext, onError, onExecution, onExecutionError, programBatch, showActivity, threadId])

  useEffect(() => () => {
    cleanup.current?.()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (contextTimer.current) clearTimeout(contextTimer.current)
    if (activityTimer.current) clearTimeout(activityTimer.current)
    const editor = editorRef.current
    if (editor) void window.pmAgent.canvas.save(threadId, getSnapshot(editor.store))
  }, [threadId])

  const fitScene = (): void => {
    editorRef.current?.zoomToFit({ animation: { duration: 220 } })
  }

  const focusSelection = (): void => {
    editorRef.current?.zoomToSelection({ animation: { duration: 220 } })
  }

  const syncCanvas = async (): Promise<void> => {
    const editor = editorRef.current
    if (!editor || syncing) return
    const context = inspectCanvas(editor, revision.current + 1)
    const nextSelection = selectionFromContext(context)
    const diff = diffCanvasContexts(syncedContext.current ?? context, context)
    setSyncing(true)
    showActivity('reasoning')
    try {
      showActivity('checkpoint')
      await window.pmAgent.canvas.save(threadId, getSnapshot(editor.store))
      setSaveState('saved')
      showActivity('verifying')
      await onSync(context, nextSelection, diff)
      syncedContext.current = context
      setDirty(false)
      showActivity('verified', 2_200)
    } catch {
      showActivity('error', 3_200)
    } finally {
      setSyncing(false)
    }
  }

  const arrangeScene = async (): Promise<void> => {
    const editor = editorRef.current
    if (!editor) return
    const context = reflowCanvas(editor)
    setSceneContext(context)
    onContextChange(context, selectionFromContext(context))
    await window.pmAgent.canvas.save(threadId, getSnapshot(editor.store))
    setSaveState('saved')
  }

  const lintErrors = sceneContext?.lints?.filter((issue) => issue.severity === 'error').length ?? 0
  const lintWarnings = sceneContext?.lints?.filter((issue) => issue.severity === 'warning').length ?? 0
  const selectedCount = sceneContext?.selectedShapeIds.length ?? 0
  const semanticCount = sceneContext?.shapes.filter((shape) => shape.semanticId && shape.nodeKind).length ?? 0
  const activity = activityStage === 'idle' ? null : activityCopy[activityStage]

  return (
    <section className="canvas-workspace" aria-label="Collaborative canvas" data-program-source={programBatch.source}>
      <div className="canvas-stage">
        <Tldraw
          assetUrls={tldrawAssetUrls}
          components={canvasComponents}
          locale="vi"
          snapshot={(snapshot ?? undefined) as TLStoreSnapshot | undefined}
          onMount={handleMount}
        />
      </div>
      {activity && (
        <div className={`canvas-activity ${activityStage}`} aria-live="polite" data-stage={activityStage}>
          {activityStage === 'verified'
            ? <CheckCircle2 size={17} />
            : activityStage === 'error'
              ? <TriangleAlert size={17} />
              : <LoaderCircle className="spin" size={17} />}
          <div><strong>{activity.title}</strong><span>{activity.detail}</span></div>
          <div className="activity-steps" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => <i className={step <= activity.step ? 'active' : ''} key={step} />)}
          </div>
        </div>
      )}
      <div className="canvas-scene-bar" aria-label="Canvas scene controls">
        <span
          className={`scene-health ${lintErrors > 0 ? 'error' : lintWarnings > 0 ? 'warning' : 'clean'}`}
          title={lintErrors > 0 ? 'Canvas có lỗi bố cục' : lintWarnings > 0 ? 'Canvas có cảnh báo' : 'Canvas không có lỗi bố cục'}
        >
          {lintErrors > 0 ? <TriangleAlert size={15} /> : <CheckCircle2 size={15} />}
          <span>{lintErrors > 0 ? `${lintErrors} lỗi` : lintWarnings > 0 ? `${lintWarnings} lưu ý` : 'Scene sạch'}</span>
        </span>
        {selectedCount > 0 && (
          <span className="scene-selection" title="Vùng đang được gửi kèm chat">
            <ScanSearch size={15} />
            <span>{selectedCount}</span>
          </span>
        )}
        {dirty && <span className="scene-dirty">Chưa sync</span>}
        <span className="scene-divider" />
        <button className="scene-icon-button" title="Căn lại sơ đồ" onClick={() => void arrangeScene()}>
          <WandSparkles size={16} />
        </button>
        <button className="scene-icon-button" title="Fit toàn bộ nội dung" onClick={fitScene}>
          <Focus size={16} />
        </button>
        <button className="scene-icon-button" disabled={selectedCount === 0} title="Focus vùng đang chọn" onClick={focusSelection}>
          <Crosshair size={16} />
        </button>
        <button
          className={dirty ? 'scene-sync-button dirty' : 'scene-sync-button'}
          disabled={semanticCount === 0 || syncing || agentBusy}
          title="Đọc canvas và vùng chọn vào chat context"
          onClick={() => void syncCanvas()}
        >
          {syncing ? <LoaderCircle className="spin" size={15} /> : <CloudUpload size={15} />}
          <span>Sync</span>
        </button>
      </div>
      <div className="canvas-tool-bar" aria-label="Canvas drawing tools">
        {canvasTools.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`canvas-tool-button ${activeTool === id ? 'active' : ''}`}
            title={label}
            aria-label={label}
            aria-pressed={activeTool === id}
            onClick={() => {
              editorRef.current?.setCurrentTool(id)
              setActiveTool(id)
            }}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <span className={`save-indicator canvas-save-indicator ${saveState}`}>{saveState === 'saving' ? 'Đang lưu' : 'Đã lưu local'}</span>
    </section>
  )
}
