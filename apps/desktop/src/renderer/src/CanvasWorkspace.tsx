import { useCallback, useEffect, useRef, useState } from 'react'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { projectProductSpecGraph } from '@pm-agent/canvas'
import {
  Tldraw,
  createShapeId,
  getSnapshot,
  toRichText,
  type Editor,
  type TLShape,
  type TLStoreSnapshot,
} from 'tldraw'
import type {
  CanvasSelectionContext,
  CanvasGestureCommand,
  ChangePreview,
  ProductSpec,
  ProviderCommand,
  WorkflowView,
} from '@pm-agent/domain'

interface CanvasWorkspaceProps {
  threadId: string
  snapshot: unknown | null
  initialView: WorkflowView
  commandBatch: { id: number; commands: ProviderCommand[] }
  productSpec?: ProductSpec
  changePreview?: ChangePreview
  changeEntityIds: string[]
  onSelectionChange(selection?: CanvasSelectionContext): void
  onGestureProposal(command: CanvasGestureCommand): void
}

interface CanonicalShapeRef {
  type: 'entity' | 'edge'
  entityId: string
}

const views: Array<{ id: WorkflowView; label: string }> = [
  { id: 'discover', label: 'Discover' },
  { id: 'decide', label: 'Decide' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'change', label: 'Change' },
]

const tldrawAssetUrls = getAssetUrlsByImport()
const legacySeedIds = ['idea', 'finding', 'minimal', 'balanced', 'ambitious', 'req-payment', 'screen-payment', 'wallet-story', 'wallet-sdk']
const canonicalEntityKinds = new Set(['idea', 'goal', 'finding', 'requirement', 'screen', 'story', 'dependency', 'decision'])

function shapeLabel(shape: { meta: Record<string, unknown> }): string {
  return typeof shape.meta.label === 'string' ? shape.meta.label : ''
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function findShape(editor: Editor, query: string): TLShape | undefined {
  const shapes = editor.getCurrentPageShapes()
  const normalizedQuery = normalizeSearch(query)
  const exact = shapes.find((shape) => normalizeSearch(shapeLabel(shape)).includes(normalizedQuery))
  if (exact) return exact
  const tokens = normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length > 1)
  return shapes
    .map((shape) => ({ shape, score: tokens.filter((token) => normalizeSearch(shapeLabel(shape)).includes(token)).length }))
    .sort((left, right) => right.score - left.score)
    .find((candidate) => candidate.score > 0)?.shape
}

function removeLegacySeed(editor: Editor): void {
  const legacy = editor.getCurrentPageShapes().filter((shape) => legacySeedIds.includes(String(shape.meta.entityId ?? '')))
  if (legacy.length > 0) editor.deleteShapes(legacy.map((shape) => shape.id))
}

function reconcileProductSpec(editor: Editor, spec: ProductSpec): void {
  const graph = projectProductSpecGraph(spec)
  const projections = graph.entities
  const canonicalIds = new Set([
    ...projections.map((projection) => projection.entityId),
    ...graph.edges.map((edge) => edge.relationshipId),
  ])
  const currentShapes = editor.getCurrentPageShapes()
  const byEntityId = new Map(currentShapes.map((shape) => [String(shape.meta.entityId ?? ''), shape]))

  for (const projection of projections) {
    const shapeId = createShapeId(projection.entityId.toLowerCase())
    const existing = byEntityId.get(projection.entityId) ?? editor.getShape(shapeId)
    const meta = {
      entityId: projection.entityId,
      entityKind: projection.kind,
      label: projection.label,
      shapeType: projection.shapeType,
      view: projection.view,
      status: projection.state,
    }
    if (existing?.type === 'note') {
      editor.updateShape({
        id: existing.id,
        type: 'note',
        x: projection.x,
        y: projection.y,
        opacity: projection.state === 'removed' ? 0.18 : 1,
        props: { color: projection.tone, size: 'm', richText: toRichText(projection.label) },
        meta,
      })
    } else if (!existing) {
      editor.createShape({
        id: shapeId,
        type: 'note',
        x: projection.x,
        y: projection.y,
        opacity: projection.state === 'removed' ? 0.18 : 1,
        props: { color: projection.tone, size: 'm', richText: toRichText(projection.label) },
        meta,
      })
    }
  }


  const projectionById = new Map(projections.map((projection) => [projection.entityId, projection]))
  for (const edge of graph.edges) {
    const source = projectionById.get(edge.sourceEntityId)!
    const target = projectionById.get(edge.targetEntityId)!
    const x = source.x + source.width / 2
    const y = source.y + source.height / 2
    const edgeId = createShapeId(`edge-${edge.relationshipId.toLowerCase()}`)
    const meta = {
      entityId: edge.relationshipId,
      entityKind: 'relationship',
      label: edge.relationshipType,
      view: edge.view,
      sourceEntityId: edge.sourceEntityId,
      targetEntityId: edge.targetEntityId,
      sourceView: edge.sourceView,
      targetView: edge.targetView,
      shapeType: edge.shapeType,
      status: 'active',
    }
    const shape = {
      id: edgeId,
      type: 'arrow' as const,
      x,
      y,
      props: {
        start: { x: 0, y: 0 },
        end: { x: target.x + target.width / 2 - x, y: target.y + target.height / 2 - y },
        color: 'grey' as const,
        dash: 'dashed' as const,
        size: 's' as const,
        arrowheadEnd: 'arrow' as const,
      },
      meta,
    }
    if (editor.getShape(edgeId)?.type === 'arrow') editor.updateShape(shape)
    else editor.createShape(shape)
  }

  for (const shape of currentShapes) {
    const entityId = typeof shape.meta.entityId === 'string' ? shape.meta.entityId : null
    if (!entityId || typeof shape.meta.entityKind !== 'string' || canonicalIds.has(entityId)) continue
    editor.updateShape({ id: shape.id, type: shape.type, opacity: 0.18, meta: { ...shape.meta, status: 'removed' } })
  }
}

function canonicalShapeRefs(spec: ProductSpec): Map<string, CanonicalShapeRef> {
  const graph = projectProductSpecGraph(spec)
  return new Map([
    ...graph.entities.map((entity): [string, CanonicalShapeRef] => [createShapeId(entity.entityId.toLowerCase()), { type: 'entity', entityId: entity.entityId }]),
    ...graph.edges.map((edge): [string, CanonicalShapeRef] => [createShapeId(`edge-${edge.relationshipId.toLowerCase()}`), { type: 'edge', entityId: edge.relationshipId }]),
  ])
}

export function CanvasWorkspace({
  threadId,
  snapshot,
  initialView,
  commandBatch,
  productSpec,
  changePreview,
  changeEntityIds,
  onSelectionChange,
  onGestureProposal,
}: CanvasWorkspaceProps): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const gestureProposalRef = useRef(onGestureProposal)
  const canonicalShapeRefsRef = useRef<Map<string, CanonicalShapeRef>>(new Map())
  const cleanupListeners = useRef<(() => void) | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommandBatch = useRef(0)
  const lastGestureProposal = useRef<{ entityId: string; at: number } | null>(null)
  const [view, setView] = useState<WorkflowView>(initialView)
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const [editorEpoch, setEditorEpoch] = useState(0)
  const changeKey = changeEntityIds.join('|')

  useEffect(() => {
    gestureProposalRef.current = onGestureProposal
  }, [onGestureProposal])

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
    setEditorEpoch((value) => value + 1)
    if (productSpec) canonicalShapeRefsRef.current = canonicalShapeRefs(productSpec)
    editor.run(() => {
      removeLegacySeed(editor)
      if (productSpec) reconcileProductSpec(editor, productSpec)
    }, { history: 'ignore' })
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
    const stopCanonicalDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', (shape) => {
      const canonicalRef = canonicalShapeRefsRef.current.get(shape.id)
      const shapeType = shape.meta.shapeType
      const isEntity = canonicalRef?.type === 'entity'
        || shapeType === 'pm_entity'
        || canonicalEntityKinds.has(String(shape.meta.entityKind ?? ''))
      if (!isEntity) return
      const entityId = canonicalRef?.type === 'entity' ? canonicalRef.entityId : shape.meta.entityId
      if (isEntity && typeof entityId === 'string') {
        const previous = lastGestureProposal.current
        if (!previous || previous.entityId !== entityId || Date.now() - previous.at > 750) {
          lastGestureProposal.current = { entityId, at: Date.now() }
          gestureProposalRef.current({ schemaVersion: 1, type: 'remove_entity', entityId })
        }
      }
      return false
    })
    editor.zoomToFit({ animation: { duration: 180 } })
    cleanupListeners.current = () => {
      stopDocumentListener()
      stopSelectionListener()
      stopCanonicalDelete()
    }
  }, [onSelectionChange, productSpec, scheduleSave])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !productSpec) return
    canonicalShapeRefsRef.current = canonicalShapeRefs(productSpec)
    editor.run(() => reconcileProductSpec(editor, productSpec), { history: 'ignore' })
  }, [productSpec])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const affected = new Set(changeEntityIds)
    const visibleShapeIds: TLShape['id'][] = []
    const selectedBefore = editor.getSelectedShapeIds()[0]
    editor.run(() => {
      for (const shape of editor.getCurrentPageShapes()) {
        const entityId = String(shape.meta.entityId ?? '')
        const shapeView = shape.meta.view
        const status = shape.meta.status
        const isEdge = shape.meta.shapeType === 'pm_traceability_edge'
        const sourceEntityId = String(shape.meta.sourceEntityId ?? '')
        const targetEntityId = String(shape.meta.targetEntityId ?? '')
        const visible = view === 'change'
          ? affected.size === 0
            ? true
            : isEdge
              ? affected.has(sourceEntityId) && affected.has(targetEntityId)
              : affected.has(entityId) || shapeView === 'change'
          : isEdge
            ? shape.meta.sourceView === view && shape.meta.targetView === view
            : shapeView === view
        const opacity = !visible ? 0 : status === 'removed' ? 0.18 : changePreview && affected.has(entityId) ? 0.5 : 1
        editor.updateShape({ id: shape.id, type: shape.type, opacity })
        if (visible) visibleShapeIds.push(shape.id)
      }
    }, { history: 'ignore' })
    if (visibleShapeIds.length > 0) {
      editor.select(...visibleShapeIds)
      editor.zoomToSelection({ animation: { duration: 180 } })
      if (selectedBefore && visibleShapeIds.includes(selectedBefore)) editor.select(selectedBefore)
      else editor.selectNone()
    }
  }, [changeKey, changePreview, editorEpoch, productSpec?.version, view])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !changePreview) return
    setView('change')
    const target = findShape(editor, changePreview.intent.targetEntityId)
    if (target) editor.select(target.id)
  }, [changePreview])

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
          y: 820,
          props: { color: 'yellow', size: 'm', richText: toRichText(command.label) },
          meta: { entityId, label: command.label, view: command.view ?? view, status: 'proposed' },
        })
        continue
      }
      const shape = findShape(editor, command.query)
      if (!shape) continue
      editor.select(shape.id)
      if (command.type === 'remove_card') {
        editor.updateShape({ id: shape.id, type: shape.type, opacity: 0.5, meta: { ...shape.meta, status: 'pending_remove' } })
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
