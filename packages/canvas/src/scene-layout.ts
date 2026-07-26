import dagre from '@dagrejs/dagre'
import {
  canvasProgramSchema,
  type CanvasDocumentContext,
  type CanvasLintIssue,
  type CanvasNodeKind,
  type CanvasOperation,
  type CanvasProgram,
  type CanvasShapeContext,
} from '@pm-agent/domain'

export interface CanvasNodeDimensions {
  width: number
  height: number
}

interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

interface LayoutOptions {
  force?: boolean
  respectExplicitPositions?: boolean
}

const GRID = 8
const NODE_GAP = 56
const LARGE_SCENE_NODE_COUNT = 10
const PROTOTYPE_COLUMN_GAP = 100
const PROTOTYPE_ROW_GAP = 180

export function canvasNodeDimensions(kind: CanvasNodeKind, label = '', semanticId = '', rich = false, description = ''): CanvasNodeDimensions {
  if (kind === 'screen' && semanticId.startsWith('prototype-')) return { width: 360, height: 720 }
  if (rich) {
    const descriptionLines = description ? Math.ceil(description.length / 32) : 0
    const extraHeight = Math.min(220, Math.max(0, descriptionLines - 2) * 22)
    if (kind === 'decision') return { width: 300, height: 220 + extraHeight }
    return { width: 300, height: 200 + extraHeight }
  }
  const extraLine = Math.max(0, Math.ceil(label.length / 24) - 2)
  if (kind === 'decision') return { width: 224, height: 144 + extraLine * 18 }
  if (kind === 'screen') return { width: 244, height: 128 + extraLine * 18 }
  if (kind === 'note') return { width: 220, height: 112 + extraLine * 18 }
  return { width: 232, height: 104 + extraLine * 18 }
}

function roundToGrid(value: number): number {
  return Math.round(value / GRID) * GRID
}

function overlaps(first: Rectangle, second: Rectangle, padding = 0): boolean {
  return first.x < second.x + second.width + padding
    && first.x + first.width + padding > second.x
    && first.y < second.y + second.height + padding
    && first.y + first.height + padding > second.y
}

function boundsOf(rectangles: Rectangle[]): Rectangle | undefined {
  if (rectangles.length === 0) return undefined
  const minX = Math.min(...rectangles.map((item) => item.x))
  const minY = Math.min(...rectangles.map((item) => item.y))
  const maxX = Math.max(...rectangles.map((item) => item.x + item.width))
  const maxY = Math.max(...rectangles.map((item) => item.y + item.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function semanticNodes(context: CanvasDocumentContext): CanvasShapeContext[] {
  return context.shapes.filter((shape) => Boolean(shape.semanticId && shape.nodeKind))
}

// Sequence diagram: each distinct lane becomes a vertical actor column; nodes flow
// downward in emission (message) order. Read like a UML sequence chart.
function arrangeSequence(
  raw: Map<string, Rectangle>,
  nodes: Array<Extract<CanvasOperation, { op: 'create_node' }>>,
): Map<string, Rectangle> {
  const lanes: string[] = []
  for (const node of nodes) {
    const lane = node.lane ?? '—'
    if (!lanes.includes(lane)) lanes.push(lane)
  }
  const columnWidth = Math.max(...nodes.map((node) => raw.get(node.id)!.width)) + 96
  const arranged = new Map<string, Rectangle>()
  for (const [row, node] of nodes.entries()) {
    const rectangle = raw.get(node.id)!
    const column = lanes.indexOf(node.lane ?? '—')
    arranged.set(node.id, {
      ...rectangle,
      x: column * columnWidth,
      y: row * (rectangle.height + 72),
    })
  }
  return arranged
}

function arrangePrototypeDeck(
  raw: Map<string, Rectangle>,
  nodes: Array<Extract<CanvasOperation, { op: 'create_node' }>>,
): Map<string, Rectangle> {
  const columns = nodes.length <= 4 ? 2 : 3
  const arranged = new Map<string, Rectangle>()
  for (const [index, node] of nodes.entries()) {
    const row = Math.floor(index / columns)
    const positionInRow = index % columns
    const column = row % 2 === 0 ? positionInRow : columns - positionInRow - 1
    const rectangle = raw.get(node.id)!
    arranged.set(node.id, {
      ...rectangle,
      x: column * (rectangle.width + PROTOTYPE_COLUMN_GAP),
      y: row * (rectangle.height + PROTOTYPE_ROW_GAP),
    })
  }
  return arranged
}

function availableTranslation(
  base: Map<string, Rectangle>,
  occupied: Rectangle[],
  initial: { x: number; y: number },
): { x: number; y: number } {
  const candidates = [
    initial,
    { x: initial.x, y: initial.y + 280 },
    { x: initial.x, y: initial.y - 280 },
    { x: initial.x + 360, y: initial.y },
    { x: initial.x + 360, y: initial.y + 280 },
    { x: initial.x + 360, y: initial.y - 280 },
    { x: initial.x, y: initial.y + 560 },
    { x: initial.x + 720, y: initial.y },
  ]
  for (const candidate of candidates) {
    const translated = [...base.values()].map((rect) => ({ ...rect, x: rect.x + candidate.x, y: rect.y + candidate.y }))
    if (translated.every((rect) => occupied.every((other) => !overlaps(rect, other, NODE_GAP)))) return candidate
  }
  const occupiedBounds = boundsOf(occupied)
  return occupiedBounds
    ? { x: occupiedBounds.x + occupiedBounds.width + 180, y: occupiedBounds.y }
    : initial
}

export function layoutCanvasProgram(
  input: CanvasProgram,
  context: CanvasDocumentContext,
  options: LayoutOptions = {},
): CanvasProgram {
  const program = canvasProgramSchema.parse(input)
  if (program.mode !== 'operations') return program
  const nodeOperations = program.operations.filter(
    (operation): operation is Extract<CanvasOperation, { op: 'create_node' }> => operation.op === 'create_node',
  )
  if (nodeOperations.length === 0) return program

  const existing = new Map(semanticNodes(context).map((shape) => [shape.semanticId!, shape]))
  const connections = program.operations.filter(
    (operation): operation is Extract<CanvasOperation, { op: 'connect' }> => operation.op === 'connect',
  )
  const nodeById = new Map(nodeOperations.map((node) => [node.id, node]))
  for (const connection of connections) {
    for (const endpoint of [connection.fromId, connection.toId]) {
      if (!nodeById.has(endpoint) && existing.has(endpoint)) {
        const shape = existing.get(endpoint)!
        nodeById.set(endpoint, {
          op: 'create_node',
          id: endpoint,
          label: shape.label || endpoint,
          kind: shape.nodeKind ?? 'process',
        })
      }
    }
  }

  const hasExistingParticipant = [...nodeById.keys()].some((id) => existing.has(id))
  const isPrototypeDeck = nodeOperations.length >= 3
    && nodeOperations.length <= 5
    && nodeOperations.every((node) => node.kind === 'screen' && node.id.startsWith('prototype-'))
  const sceneType = program.sceneType
  const isSequence = !hasExistingParticipant && sceneType === 'sequence'
  // Per-diagram orientation:
  //  - sequence: custom actor-column grid (below).
  //  - state machine: top-to-bottom transitions read like a lifecycle.
  //  - mind map / ER: left-to-right so the root/entities fan out horizontally.
  //  - workflow: L→R when small, T→B once large so it stays narrow and crossing-light.
  let rankdir: 'TB' | 'LR' = 'LR'
  if (!hasExistingParticipant && !isPrototypeDeck && !isSequence) {
    if (sceneType === 'state') rankdir = 'TB'
    else if (sceneType === 'mindmap' || sceneType === 'er') rankdir = 'LR'
    else if (nodeOperations.length > LARGE_SCENE_NODE_COUNT) rankdir = 'TB'
  }
  const useVertical = rankdir === 'TB'

  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({
    rankdir,
    align: 'UL',
    nodesep: useVertical ? 72 : 88,
    edgesep: useVertical ? 28 : 48,
    ranksep: useVertical ? 120 : 156,
    marginx: 24,
    marginy: 24,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodeById.values()) {
    const dimensions = existing.get(node.id)
      ? { width: existing.get(node.id)!.width, height: existing.get(node.id)!.height }
      : canvasNodeDimensions(node.kind, node.label, node.id, Boolean(node.description || node.badge || node.lane), node.description)
    graph.setNode(node.id, dimensions)
  }
  for (const [index, connection] of connections.entries()) {
    if (graph.hasNode(connection.fromId) && graph.hasNode(connection.toId)) {
      graph.setEdge(connection.fromId, connection.toId, { minlen: 1, weight: connection.label ? 2 : 3 }, `${connection.id}:${index}`)
    }
  }
  dagre.layout(graph)

  let raw = new Map<string, Rectangle>()
  for (const node of nodeOperations) {
    const value = graph.node(node.id) as { x: number; y: number; width: number; height: number }
    raw.set(node.id, {
      x: value.x - value.width / 2,
      y: value.y - value.height / 2,
      width: value.width,
      height: value.height,
    })
  }
  if (isSequence) {
    raw = arrangeSequence(raw, nodeOperations)
  } else if (!hasExistingParticipant && isPrototypeDeck) {
    raw = arrangePrototypeDeck(raw, nodeOperations)
  }
  // Large fresh flows already used the vertical (TB) dagre pass above, which lays them
  // out as clean crossing-minimized layers instead of the old hand-rolled snake wrap.

  const movable = nodeOperations.filter((node) => options.force || !existing.has(node.id))
  const occupied = context.shapes
    .filter((shape) => shape.type !== 'arrow'
      && !shape.visualRole?.startsWith('prototype-scene')
      && !movable.some((node) => node.id === shape.semanticId))
    .map((shape) => ({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }))
  const participatingExisting = [...nodeById.keys()].map((id) => existing.get(id)).find(Boolean)
  const rawAnchor = participatingExisting ? graph.node(participatingExisting.semanticId!) as { x: number; y: number; width: number; height: number } : undefined
  const viewport = context.viewport ?? { x: 0, y: 0, width: 1_280, height: 800 }
  const graphBounds = boundsOf([...raw.values()]) ?? { x: 0, y: 0, width: 0, height: 0 }
  let initial = participatingExisting && rawAnchor
    ? {
        x: participatingExisting.x + participatingExisting.width / 2 - rawAnchor.x,
        y: participatingExisting.y + participatingExisting.height / 2 - rawAnchor.y,
      }
    : {
        x: viewport.x + Math.max(96, (viewport.width - graphBounds.width) / 2) - graphBounds.x,
        y: viewport.y + Math.max(96, (viewport.height - graphBounds.height) / 2) - graphBounds.y,
      }
  if (!participatingExisting && occupied.length > 0) {
    const occupiedBounds = boundsOf(occupied)!
    initial = { x: occupiedBounds.x + occupiedBounds.width + 180 - graphBounds.x, y: occupiedBounds.y - graphBounds.y }
  }
  const movableRaw = new Map(movable.map((node) => [node.id, raw.get(node.id)!]))
  const translation = availableTranslation(movableRaw, occupied, initial)

  const positioned = new Map<string, { x: number; y: number }>()
  for (const node of movable) {
    if (options.respectExplicitPositions && node.x !== undefined && node.y !== undefined) {
      positioned.set(node.id, { x: node.x, y: node.y })
    } else {
      const rectangle = raw.get(node.id)!
      positioned.set(node.id, {
        x: roundToGrid(rectangle.x + translation.x),
        y: roundToGrid(rectangle.y + translation.y),
      })
    }
  }

  return canvasProgramSchema.parse({
    ...program,
    operations: program.operations.map((operation) => {
      if (operation.op !== 'create_node') return operation
      const position = positioned.get(operation.id)
      return position ? { ...operation, ...position } : operation
    }),
  })
}

export function lintCanvasDocument(
  context: CanvasDocumentContext,
  affectedSemanticIds: string[] = [],
): CanvasLintIssue[] {
  const issues: CanvasLintIssue[] = []
  const nodes = semanticNodes(context)
  const affected = new Set(affectedSemanticIds)
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    const first = nodes[firstIndex]!
    if (first.width <= 0 || first.height <= 0) {
      issues.push({ code: 'invalid_bounds', severity: 'error', message: `${first.label || first.semanticId} có bounds không hợp lệ.`, shapeIds: [first.id] })
    }
    for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
      const second = nodes[secondIndex]!
      if (affected.size > 0 && !affected.has(first.semanticId!) && !affected.has(second.semanticId!)) continue
      if (overlaps(first, second, -8)) {
        issues.push({
          code: 'node_overlap',
          severity: 'error',
          message: `${first.label || first.semanticId} đang chồng lên ${second.label || second.semanticId}.`,
          shapeIds: [first.id, second.id],
        })
      }
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.semanticId!))
  const degree = new Map(nodes.map((node) => [node.semanticId!, 0]))
  for (const binding of context.bindings ?? []) {
    if (!nodeIds.has(binding.fromId) || !nodeIds.has(binding.toId)) {
      issues.push({
        code: 'dangling_edge',
        severity: 'error',
        message: `Kết nối ${binding.label || binding.id} thiếu endpoint.`,
        shapeIds: [binding.shapeId],
      })
      continue
    }
    degree.set(binding.fromId, (degree.get(binding.fromId) ?? 0) + 1)
    degree.set(binding.toId, (degree.get(binding.toId) ?? 0) + 1)
  }
  if (nodes.length > 1) {
    for (const node of nodes) {
      if ((degree.get(node.semanticId!) ?? 0) === 0 && (affected.size === 0 || affected.has(node.semanticId!))) {
        issues.push({
          code: 'disconnected_node',
          severity: 'warning',
          message: `${node.label || node.semanticId} chưa có kết nối.`,
          shapeIds: [node.id],
        })
      }
    }
  }
  return issues
}
