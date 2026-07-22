import { useCallback, useEffect, useRef, useState } from 'react'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import {
  Tldraw,
  createShapeId,
  getSnapshot,
  toRichText,
  type Editor,
  type TLStoreSnapshot,
} from 'tldraw'
import type {
  CanvasSelectionContext,
  ProviderCommand,
  WorkflowView,
} from '@pm-agent/domain'

interface CanvasWorkspaceProps {
  threadId: string
  snapshot: unknown | null
  initialView: WorkflowView
  commandBatch: { id: number; commands: ProviderCommand[] }
  onSelectionChange(selection?: CanvasSelectionContext): void
}

const views: Array<{ id: WorkflowView; label: string }> = [
  { id: 'discover', label: 'Discover' },
  { id: 'decide', label: 'Decide' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'change', label: 'Change' },
]

const tldrawAssetUrls = getAssetUrlsByImport()

type NoteColor = 'yellow' | 'green' | 'blue' | 'violet' | 'orange' | 'red'

const seedCards: Array<{ id: string; label: string; view: WorkflowView; x: number; y: number; color: NoteColor }> = [
  { id: 'idea', label: 'Idea\nĐặt suất ăn trước tại pantry', view: 'discover', x: 80, y: 110, color: 'yellow' },
  { id: 'finding', label: 'Evidence\nGiảm thời gian xếp hàng giờ trưa', view: 'discover', x: 330, y: 110, color: 'green' },
  { id: 'minimal', label: 'Minimal\nĐặt món + mã nhận suất', view: 'decide', x: 80, y: 400, color: 'blue' },
  { id: 'balanced', label: 'Balanced\nĐặt món + ví nội bộ', view: 'decide', x: 330, y: 400, color: 'violet' },
  { id: 'ambitious', label: 'Ambitious\nGợi ý món + nhóm đặt chung', view: 'decide', x: 580, y: 400, color: 'orange' },
  { id: 'req-payment', label: 'REQ-PAYMENT\nThanh toán bằng ví nội bộ', view: 'deliver', x: 830, y: 110, color: 'violet' },
  { id: 'screen-payment', label: 'Payment Screen\nDesign System guarded', view: 'deliver', x: 830, y: 400, color: 'blue' },
  { id: 'wallet-story', label: 'Wallet Story\nMock Jira', view: 'deliver', x: 1080, y: 400, color: 'green' },
  { id: 'wallet-sdk', label: 'Dependency\nWallet SDK', view: 'change', x: 1080, y: 110, color: 'red' },
]

function seedCanvas(editor: Editor): void {
  editor.createShapes(seedCards.map((card) => ({
    id: createShapeId(card.id),
    type: 'note' as const,
    x: card.x,
    y: card.y,
    props: {
      color: card.color,
      size: 'm',
      richText: toRichText(card.label),
    },
    meta: { entityId: card.id, label: card.label, view: card.view, status: 'active' },
  })))
  editor.zoomToFit({ animation: { duration: 0 } })
}

function shapeLabel(shape: { meta: Record<string, unknown> }): string {
  return typeof shape.meta.label === 'string' ? shape.meta.label : ''
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function findShape(editor: Editor, query: string) {
  const shapes = editor.getCurrentPageShapes()
  const normalizedQuery = normalizeSearch(query)
  const exact = shapes.find((shape) => normalizeSearch(shapeLabel(shape)).includes(normalizedQuery))
  if (exact) return exact

  const tokens = normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length > 1)
  return shapes
    .map((shape) => ({
      shape,
      score: tokens.filter((token) => normalizeSearch(shapeLabel(shape)).includes(token)).length,
    }))
    .sort((left, right) => right.score - left.score)
    .find((candidate) => candidate.score > 0)?.shape
}

export function CanvasWorkspace({
  threadId,
  snapshot,
  initialView,
  commandBatch,
  onSelectionChange,
}: CanvasWorkspaceProps): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const cleanupListeners = useRef<(() => void) | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommandBatch = useRef(0)
  const [view, setView] = useState<WorkflowView>(initialView)
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')

  const scheduleSave = useCallback(() => {
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const editor = editorRef.current
      if (!editor) return
      void window.pmAgent.canvas.save(threadId, getSnapshot(editor.store)).then(() => setSaveState('saved'))
    }, 650)
  }, [threadId])

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    if (editor.getCurrentPageShapes().length === 0) seedCanvas(editor)
    const stopDocumentListener = editor.store.listen(scheduleSave, { scope: 'document' })
    const stopSelectionListener = editor.store.listen(() => {
      const selected = editor.getSelectedShapes()[0]
      if (!selected) {
        onSelectionChange()
        return
      }
      const entityId = typeof selected.meta.entityId === 'string' ? selected.meta.entityId : selected.id
      onSelectionChange({ entityId, label: shapeLabel(selected) || selected.type })
    }, { scope: 'session' })
    editor.zoomToFit({ animation: { duration: 180 } })
    cleanupListeners.current = () => {
      stopDocumentListener()
      stopSelectionListener()
    }
  }, [onSelectionChange, scheduleSave])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || commandBatch.id === 0 || commandBatch.id === lastCommandBatch.current) return
    lastCommandBatch.current = commandBatch.id
    for (const command of commandBatch.commands) {
      if (command.type === 'switch_view') {
        setView(command.view)
        continue
      }
      if (command.type === 'add_card') {
        const entityId = `proposal-${Date.now()}`
        editor.createShape({
          id: createShapeId(entityId),
          type: 'note',
          x: 140 + (editor.getCurrentPageShapes().length % 4) * 250,
          y: 720,
          props: { color: 'yellow', size: 'm', richText: toRichText(command.label) },
          meta: { entityId, label: command.label, view: command.view ?? view, status: 'proposed' },
        })
        continue
      }
      const query = command.query.toLowerCase()
      const shape = findShape(editor, query)
      if (!shape) continue
      editor.select(shape.id)
      editor.zoomToSelection({ animation: { duration: 220 } })
      if (command.type === 'remove_card') {
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          opacity: 0.28,
          meta: { ...shape.meta, status: 'pending_remove' },
        })
      }
    }
  }, [commandBatch, view])

  useEffect(() => () => {
    cleanupListeners.current?.()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const editor = editorRef.current
    if (editor) void window.pmAgent.canvas.save(threadId, getSnapshot(editor.store))
  }, [threadId])

  return (
    <section className="canvas-workspace" aria-label="Product lifecycle canvas">
      <div className="canvas-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Lifecycle view">
          {views.map((item) => (
            <button
              className={view === item.id ? 'view-tab active' : 'view-tab'}
              key={item.id}
              onClick={() => setView(item.id)}
              role="tab"
              aria-selected={view === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className={`save-indicator ${saveState}`}>{saveState === 'saving' ? 'Đang lưu' : 'Đã lưu local'}</span>
      </div>
      <div className="canvas-stage">
        <Tldraw
          assetUrls={tldrawAssetUrls}
          locale="vi"
          snapshot={(snapshot ?? undefined) as TLStoreSnapshot | undefined}
          onMount={handleMount}
        />
      </div>
    </section>
  )
}
