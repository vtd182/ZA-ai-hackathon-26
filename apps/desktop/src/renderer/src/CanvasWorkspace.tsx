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

type CanvasView = 'board' | WorkflowView

const views: Array<{ id: CanvasView; label: string }> = [
  { id: 'board', label: 'Board' },
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
    const sourceShapeId = createShapeId(source.entityId.toLowerCase())
    const targetShapeId = createShapeId(target.entityId.toLowerCase())
    const sourceBounds = editor.getShapePageBounds(sourceShapeId)
    const targetBounds = editor.getShapePageBounds(targetShapeId)
    const x = sourceBounds?.center.x ?? source.x + source.width / 2
    const y = sourceBounds?.center.y ?? source.y + source.height / 2
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
        end: {
          x: (targetBounds?.center.x ?? target.x + target.width / 2) - x,
          y: (targetBounds?.center.y ?? target.y + target.height / 2) - y,
        },
        color: 'grey' as const,
        dash: 'dashed' as const,
        size: 's' as const,
        arrowheadEnd: 'arrow' as const,
      },
      meta,
    }
    if (editor.getShape(edgeId)?.type === 'arrow') editor.updateShape({ id: edgeId, type: 'arrow', meta })
    else editor.createShape(shape)

    const bindings = editor.getBindingsInvolvingShape(edgeId, 'arrow').filter((binding) => binding.fromId === edgeId)
    if (!bindings.some((binding) => binding.props.terminal === 'start')) {
      editor.createBinding({
        type: 'arrow', fromId: edgeId, toId: sourceShapeId,
        props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' },
      })
    }
    if (!bindings.some((binding) => binding.props.terminal === 'end')) {
      editor.createBinding({
        type: 'arrow', fromId: edgeId, toId: targetShapeId,
        props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' },
      })
    }
  }

  for (const shape of currentShapes) {
    const entityId = typeof shape.meta.entityId === 'string' ? shape.meta.entityId : null
    if (!entityId || typeof shape.meta.entityKind !== 'string' || canonicalIds.has(entityId)) continue
    editor.updateShape({ id: shape.id, type: shape.type, opacity: 0.18, meta: { ...shape.meta, status: 'removed' } })
  }
}

function semanticShapeId(nodeId: string): TLShape['id'] {
  const normalized = nodeId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'node'
  return createShapeId(`agent-${normalized}`)
}

function createSemanticFlow(editor: Editor, commands: ProviderCommand[]): TLShape['id'][] {
  const nodes = commands.filter((command) => command.type === 'create_canvas_node')
  const viewport = editor.getViewportPageBounds()
  const originX = viewport.center.x - Math.min(nodes.length, 3) * 130
  const originY = viewport.center.y - Math.ceil(nodes.length / 3) * 80
  const createdIds: TLShape['id'][] = []

  nodes.forEach((command, index) => {
    if (command.type !== 'create_canvas_node') return
    const id = semanticShapeId(command.nodeId)
    const existing = editor.getShape(id)
    const meta = { semanticId: command.nodeId, label: command.label, canvasOwner: 'agent', nodeKind: command.nodeKind }
    if (existing) {
      if (existing.type === 'note' || existing.type === 'geo') {
        editor.updateShape({ id, type: existing.type, props: { richText: toRichText(command.label) }, meta: { ...existing.meta, ...meta } })
      } else {
        editor.updateShape({ id, type: existing.type, meta: { ...existing.meta, ...meta } })
      }
      createdIds.push(id)
      return
    }
    const x = originX + (index % 3) * 280
    const y = originY + Math.floor(index / 3) * 180
    if (command.nodeKind === 'note') {
      editor.createShape({ id, type: 'note', x, y, props: { color: 'yellow', size: 'm', richText: toRichText(command.label) }, meta })
    } else {
      const geo = command.nodeKind === 'decision' ? 'diamond' : 'rectangle'
      const color = command.nodeKind === 'screen' ? 'blue' : command.nodeKind === 'decision' ? 'yellow' : 'green'
      editor.createShape({
        id,
        type: 'geo',
        x,
        y,
        props: { geo, w: 220, h: command.nodeKind === 'screen' ? 150 : 110, color, fill: 'semi', richText: toRichText(command.label) },
        meta,
      })
    }
    createdIds.push(id)
  })

  for (const command of commands) {
    if (command.type !== 'connect_canvas_nodes') continue
    const fromId = semanticShapeId(command.fromId)
    const toId = semanticShapeId(command.toId)
    const fromBounds = editor.getShapePageBounds(fromId)
    const toBounds = editor.getShapePageBounds(toId)
    if (!fromBounds || !toBounds) continue
    const edgeId = createShapeId(`agent-edge-${command.fromId}-${command.toId}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
    const existingEdge = editor.getShape(edgeId)
    if (!existingEdge) {
      editor.createShape({
        id: edgeId,
        type: 'arrow',
        x: fromBounds.center.x,
        y: fromBounds.center.y,
        props: {
          start: { x: 0, y: 0 },
          end: { x: toBounds.center.x - fromBounds.center.x, y: toBounds.center.y - fromBounds.center.y },
          arrowheadEnd: 'arrow',
          color: 'grey',
          ...(command.label ? { richText: toRichText(command.label) } : {}),
        },
        meta: { canvasOwner: 'agent', semanticId: `${command.fromId}->${command.toId}`, label: command.label ?? '' },
      })
      editor.createBindings([
        { type: 'arrow', fromId: edgeId, toId: fromId, props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
        { type: 'arrow', fromId: edgeId, toId, props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
      ])
    } else if (existingEdge.type === 'arrow' && command.label) {
      editor.updateShape({
        id: edgeId,
        type: 'arrow',
        props: { richText: toRichText(command.label) },
        meta: { ...existingEdge.meta, label: command.label },
      })
    }
    createdIds.push(edgeId)
  }
  return createdIds
}

function selectionContext(editor: Editor): CanvasSelectionContext | undefined {
  const selected = editor.getSelectedShapes()
  if (selected.length === 0) return undefined
  const selectedIds = new Set(selected.map((shape) => shape.id))
  const selectionBounds = editor.getSelectionPageBounds()
  const nearby = selectionBounds
    ? editor.getCurrentPageShapes().filter((shape) => {
      if (selectedIds.has(shape.id)) return true
      const bounds = editor.getShapePageBounds(shape)
      if (!bounds) return false
      return bounds.center.x >= selectionBounds.x && bounds.center.x <= selectionBounds.maxX
        && bounds.center.y >= selectionBounds.y && bounds.center.y <= selectionBounds.maxY
    })
    : selected
  const contextItems = nearby.slice(0, 12).map((shape) => ({
    shapeId: shape.id,
    ...(typeof shape.meta.entityId === 'string' ? { entityId: shape.meta.entityId } : {}),
    type: shape.type,
    label: shapeLabel(shape) || String(shape.meta.semanticId ?? shape.type),
  }))
  const primary = selected[0]!
  const entityId = typeof primary.meta.entityId === 'string' ? primary.meta.entityId : primary.id
  return {
    entityId,
    label: selected.map((shape) => shapeLabel(shape) || String(shape.meta.semanticId ?? shape.type)).slice(0, 3).join(' · '),
    shapeIds: selected.map((shape) => shape.id),
    selectedShapeCount: selected.length,
    contextItems,
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
  const [view, setView] = useState<CanvasView>('board')
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
      onSelectionChange(selectionContext(editor))
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
        const managed = shape.meta.shapeType === 'pm_entity' || shape.meta.shapeType === 'pm_traceability_edge'
        if (!managed) continue
        const entityId = String(shape.meta.entityId ?? '')
        const shapeView = shape.meta.view
        const status = shape.meta.status
        const isEdge = shape.meta.shapeType === 'pm_traceability_edge'
        const sourceEntityId = String(shape.meta.sourceEntityId ?? '')
        const targetEntityId = String(shape.meta.targetEntityId ?? '')
        const visible = view === 'board'
          ? false
          : view === 'change'
          ? affected.size === 0
            ? true
            : isEdge
              ? affected.has(sourceEntityId) && affected.has(targetEntityId)
              : affected.has(entityId) || shapeView === 'change'
          : isEdge
            ? shape.meta.sourceView === view && shape.meta.targetView === view
            : shapeView === view
        const opacity = !visible ? 0 : status === 'removed' ? 0.18 : changePreview && affected.has(entityId) ? 0.5 : 1
        editor.updateShape({ id: shape.id, type: shape.type, opacity, isLocked: !visible })
        if (visible) visibleShapeIds.push(shape.id)
      }
    }, { history: 'ignore' })
    if (view !== 'board' && visibleShapeIds.length > 0) {
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
    const semanticIds = createSemanticFlow(editor, commandBatch.commands)
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
      if (command.type === 'create_canvas_node' || command.type === 'connect_canvas_nodes') continue
      const shape = findShape(editor, command.query)
      if (!shape) continue
      editor.select(shape.id)
      if (command.type === 'remove_card') {
        editor.updateShape({ id: shape.id, type: shape.type, opacity: 0.5, meta: { ...shape.meta, status: 'pending_remove' } })
      }
    }
    if (semanticIds.length > 0) {
      setView('board')
      editor.select(...semanticIds)
      editor.zoomToSelection({ animation: { duration: 180 } })
      editor.selectNone()
    }
  }, [commandBatch, editorEpoch, view])

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
