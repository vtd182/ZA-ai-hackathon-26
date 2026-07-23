import { z } from 'zod'
import type { ProductSpec } from './product-spec'

export const canvasNodeKindSchema = z.enum(['note', 'process', 'decision', 'screen'])
export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>

const positionSchema = {
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
}

export const canvasOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create_node'), id: z.string().min(1), label: z.string().min(1), kind: canvasNodeKindSchema, ...positionSchema }),
  z.object({ op: z.literal('connect'), id: z.string().min(1), fromId: z.string().min(1), toId: z.string().min(1), label: z.string().min(1).optional() }),
  z.object({ op: z.literal('update'), id: z.string().min(1), label: z.string().min(1).optional(), color: z.enum(['black', 'grey', 'blue', 'green', 'yellow', 'red', 'violet', 'orange']).optional() }),
  z.object({ op: z.literal('delete'), id: z.string().min(1) }),
])
export type CanvasOperation = z.infer<typeof canvasOperationSchema>

export const canvasProgramSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['none', 'operations', 'script']),
  summary: z.string().max(500),
  operations: z.array(canvasOperationSchema).max(200),
  script: z.string().max(20_000).nullable(),
}).superRefine((program, context) => {
  if (program.mode === 'operations' && program.operations.length === 0) {
    context.addIssue({ code: 'custom', message: 'An operations program must contain at least one operation', path: ['operations'] })
  }
  if (program.mode === 'script' && !program.script?.trim()) {
    context.addIssue({ code: 'custom', message: 'A script program must contain source', path: ['script'] })
  }
  if (program.mode === 'none' && (program.operations.length > 0 || program.script)) {
    context.addIssue({ code: 'custom', message: 'A none program cannot contain work' })
  }
})
export type CanvasProgram = z.infer<typeof canvasProgramSchema>

export const emptyCanvasProgram: CanvasProgram = {
  schemaVersion: 1,
  mode: 'none',
  summary: '',
  operations: [],
  script: null,
}

export interface CanvasShapeContext {
  id: string
  type: string
  label: string
  semanticId?: string
  nodeKind?: CanvasNodeKind
  visualRole?: string
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasBindingContext {
  id: string
  shapeId: string
  fromId: string
  toId: string
  label: string
}

export interface CanvasBoundsContext {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasLintIssue {
  code: 'invalid_bounds' | 'node_overlap' | 'dangling_edge' | 'disconnected_node'
  severity: 'warning' | 'error'
  message: string
  shapeIds: string[]
}

export interface CanvasDocumentContext {
  schemaVersion: 1
  revision: number
  selectedShapeIds: string[]
  shapes: CanvasShapeContext[]
  bindings?: CanvasBindingContext[]
  viewport?: CanvasBoundsContext
  selectedBounds?: CanvasBoundsContext
  recentChangeIds?: string[]
  lints?: CanvasLintIssue[]
}

export interface CanvasExecutionReceipt {
  schemaVersion: 1
  receiptId: string
  requestId?: string
  batchId?: number
  threadId: string
  source: 'provider' | 'provider_augmented' | 'deterministic_fallback' | 'developer'
  appliedOperationCount: number
  shapeCount: number
  createdShapeIds: string[]
  lintIssues?: CanvasLintIssue[]
  at: string
}

export interface CanvasExecutionFailure {
  schemaVersion: 1
  requestId: string
  threadId: string
  error: string
  at: string
}

export interface CanvasPromotionPreview {
  schemaVersion: 1
  payloadHash: string
  productSpec: ProductSpec
  sourceShapeIds: string[]
  assumptions: string[]
}

const nullableString = { type: ['string', 'null'] } as const

export const canvasProgramJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'mode', 'summary', 'script', 'operations'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    mode: { type: 'string', enum: ['none', 'operations', 'script'] },
    summary: { type: 'string' },
    script: nullableString,
    operations: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'label', 'kind', 'fromId', 'toId', 'color', 'x', 'y'],
        properties: {
          op: { type: 'string', enum: ['create_node', 'connect', 'update', 'delete'] },
          id: { type: 'string' },
          label: nullableString,
          kind: { type: ['string', 'null'], enum: ['note', 'process', 'decision', 'screen', null] },
          fromId: nullableString,
          toId: nullableString,
          color: { type: ['string', 'null'], enum: ['black', 'grey', 'blue', 'green', 'yellow', 'red', 'violet', 'orange', null] },
          x: { type: ['number', 'null'] },
          y: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeCanvasProgram(value: unknown): CanvasProgram | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const wire = value as Record<string, unknown>
  const mode = wire.mode
  if (mode === 'none') return emptyCanvasProgram
  if (mode === 'script') {
    const script = stringValue(wire.script)
    return script ? canvasProgramSchema.parse({ schemaVersion: 1, mode, summary: stringValue(wire.summary) ?? '', operations: [], script }) : undefined
  }
  if (mode !== 'operations' || !Array.isArray(wire.operations)) return undefined
  const operations: CanvasOperation[] = []
  for (const raw of wire.operations) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const operation = raw as Record<string, unknown>
    const id = stringValue(operation.id)
    const label = stringValue(operation.label)
    if (!id) continue
    if (operation.op === 'create_node' && label) {
      const kind = canvasNodeKindSchema.safeParse(operation.kind)
      operations.push({ op: 'create_node', id, label, kind: kind.success ? kind.data : 'process', ...(typeof operation.x === 'number' ? { x: operation.x } : {}), ...(typeof operation.y === 'number' ? { y: operation.y } : {}) })
    } else if (operation.op === 'connect') {
      const fromId = stringValue(operation.fromId)
      const toId = stringValue(operation.toId)
      if (fromId && toId && fromId !== toId) operations.push({ op: 'connect', id, fromId, toId, ...(label ? { label } : {}) })
    } else if (operation.op === 'update') {
      const color = z.enum(['black', 'grey', 'blue', 'green', 'yellow', 'red', 'violet', 'orange']).safeParse(operation.color)
      if (label || color.success) operations.push({ op: 'update', id, ...(label ? { label } : {}), ...(color.success ? { color: color.data } : {}) })
    } else if (operation.op === 'delete') {
      operations.push({ op: 'delete', id })
    }
  }
  return operations.length > 0
    ? canvasProgramSchema.parse({ schemaVersion: 1, mode, summary: stringValue(wire.summary) ?? '', operations, script: null })
    : undefined
}
