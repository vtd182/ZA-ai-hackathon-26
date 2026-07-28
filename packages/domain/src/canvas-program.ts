import { z } from 'zod'
import type { ProductSpec } from './product-spec'

export const canvasNodeKindSchema = z.enum(['note', 'process', 'decision', 'screen'])
export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>

export const canvasToneSchema = z.enum(['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'accent'])
export type CanvasTone = z.infer<typeof canvasToneSchema>

export const canvasIconSchema = z.enum(['sparkles', 'user', 'shield', 'bell', 'clock', 'database', 'check', 'warning', 'phone', 'settings', 'search', 'cloud'])
export type CanvasIcon = z.infer<typeof canvasIconSchema>

export const canvasScreenBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['hero', 'metric', 'field', 'choice', 'status', 'list', 'timeline', 'toggle', 'info']),
  label: z.string().min(1).max(120),
  value: z.string().max(180).nullable().default(null),
  helper: z.string().max(180).nullable().default(null),
  tone: canvasToneSchema.default('neutral'),
  span: z.enum(['full', 'half']).default('full'),
})
export type CanvasScreenBlock = z.infer<typeof canvasScreenBlockSchema>

export const canvasScreenSpecSchema = z.object({
  eyebrow: z.string().max(80).nullable().default(null),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(220).nullable().default(null),
  blocks: z.array(canvasScreenBlockSchema).min(2).max(10),
  primaryAction: z.string().min(1).max(80),
  secondaryAction: z.string().max(80).nullable().default(null),
  navItems: z.array(z.string().min(1).max(30)).max(5).default([]),
  activeNav: z.string().max(30).nullable().default(null),
})
export type CanvasScreenSpec = z.infer<typeof canvasScreenSpecSchema>

const positionSchema = {
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
}

export const canvasOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create_node'),
    id: z.string().min(1),
    label: z.string().min(1),
    kind: canvasNodeKindSchema,
    description: z.string().max(240).optional(),
    badge: z.string().max(50).optional(),
    lane: z.string().max(80).optional(),
    icon: canvasIconSchema.optional(),
    tone: canvasToneSchema.optional(),
    screen: canvasScreenSpecSchema.optional(),
    ...positionSchema,
  }),
  z.object({ op: z.literal('connect'), id: z.string().min(1), fromId: z.string().min(1), toId: z.string().min(1), label: z.string().min(1).optional() }),
  z.object({ op: z.literal('update'), id: z.string().min(1), label: z.string().min(1).optional(), color: z.enum(['black', 'grey', 'blue', 'green', 'yellow', 'red', 'violet', 'orange']).optional() }),
  z.object({ op: z.literal('delete'), id: z.string().min(1) }),
  // Free-form primitive drawing for unlimited creative composition. These are presentation-only
  // (no nodeKind/semanticId) so they never promote into ProductSpec.
  z.object({
    op: z.literal('create_shape'),
    id: z.string().min(1),
    shape: z.enum(['rectangle', 'ellipse', 'triangle', 'diamond', 'star', 'hexagon', 'rhombus', 'text', 'line', 'arrow']),
    x: z.number(),
    y: z.number(),
    w: z.number().min(1).max(8000).optional(),
    h: z.number().min(1).max(8000).optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    text: z.string().max(1000).optional(),
    color: z.enum(['black', 'grey', 'blue', 'green', 'yellow', 'red', 'violet', 'orange', 'light-blue', 'light-green', 'light-red', 'light-violet']).optional(),
    fill: z.enum(['none', 'solid', 'semi', 'pattern']).optional(),
    dash: z.enum(['draw', 'solid', 'dashed', 'dotted']).optional(),
    size: z.enum(['s', 'm', 'l', 'xl']).optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
])
export type CanvasOperation = z.infer<typeof canvasOperationSchema>

export const canvasProgramSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['none', 'operations', 'script']),
  summary: z.string().max(500),
  operations: z.array(canvasOperationSchema).max(200),
  script: z.string().max(20_000).nullable(),
  sceneType: z.enum(['workflow', 'prototype', 'board', 'sequence', 'state', 'mindmap', 'er']).optional(),
  title: z.string().max(120).optional(),
  description: z.string().max(300).optional(),
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
  parentId?: string
  description?: string
  lane?: string
  tone?: CanvasTone
  content?: string[]
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
  code:
    | 'invalid_bounds'
    | 'node_overlap'
    | 'dangling_edge'
    | 'disconnected_node'
    // Logical flow-quality issues (warnings): the app self-critiques the diagram's completeness,
    // catching the gaps a human/AI reviewer would flag — missing decision branches, dead-ends,
    // unlabeled branches, loops with no exit, and a flow with no terminal state.
    | 'decision_missing_branch'
    | 'unlabeled_branch'
    | 'flow_dead_end'
    | 'unbounded_loop'
    | 'no_exit_point'
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

export interface CanvasShapeChange {
  id: string
  label: string
  change: 'created' | 'updated' | 'moved' | 'deleted'
  before?: CanvasBoundsContext
  after?: CanvasBoundsContext
}

export interface CanvasDiffContext {
  schemaVersion: 1
  fromRevision: number
  toRevision: number
  changes: CanvasShapeChange[]
  selectedShapeIds: string[]
  summary: string
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
  required: ['schemaVersion', 'mode', 'summary', 'script', 'operations', 'sceneType', 'title', 'description'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    mode: { type: 'string', enum: ['none', 'operations', 'script'] },
    summary: { type: 'string' },
    script: nullableString,
    sceneType: { type: ['string', 'null'], enum: ['workflow', 'prototype', 'board', 'sequence', 'state', 'mindmap', 'er', null] },
    title: nullableString,
    description: nullableString,
    operations: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'label', 'kind', 'fromId', 'toId', 'color', 'x', 'y', 'description', 'badge', 'lane', 'icon', 'tone', 'screen'],
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
          description: nullableString,
          badge: nullableString,
          lane: nullableString,
          icon: { type: ['string', 'null'], enum: ['sparkles', 'user', 'shield', 'bell', 'clock', 'database', 'check', 'warning', 'phone', 'settings', 'search', 'cloud', null] },
          tone: { type: ['string', 'null'], enum: ['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'accent', null] },
          screen: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['eyebrow', 'title', 'subtitle', 'blocks', 'primaryAction', 'secondaryAction', 'navItems', 'activeNav'],
            properties: {
              eyebrow: nullableString,
              title: { type: 'string' },
              subtitle: nullableString,
              blocks: {
                type: 'array',
                minItems: 2,
                maxItems: 10,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'kind', 'label', 'value', 'helper', 'tone', 'span'],
                  properties: {
                    id: { type: 'string' },
                    kind: { type: 'string', enum: ['hero', 'metric', 'field', 'choice', 'status', 'list', 'timeline', 'toggle', 'info'] },
                    label: { type: 'string' },
                    value: nullableString,
                    helper: nullableString,
                    tone: { type: 'string', enum: ['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'accent'] },
                    span: { type: 'string', enum: ['full', 'half'] },
                  },
                },
              },
              primaryAction: { type: 'string' },
              secondaryAction: nullableString,
              navItems: { type: 'array', maxItems: 5, items: { type: 'string' } },
              activeNav: nullableString,
            },
          },
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
    return script ? canvasProgramSchema.parse({
      schemaVersion: 1,
      mode,
      summary: stringValue(wire.summary) ?? '',
      operations: [],
      script,
      ...(stringValue(wire.sceneType) ? { sceneType: wire.sceneType } : {}),
      ...(stringValue(wire.title) ? { title: stringValue(wire.title) } : {}),
      ...(stringValue(wire.description) ? { description: stringValue(wire.description) } : {}),
    }) : undefined
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
      const icon = canvasIconSchema.safeParse(operation.icon)
      const tone = canvasToneSchema.safeParse(operation.tone)
      const screen = canvasScreenSpecSchema.safeParse(operation.screen)
      operations.push({
        op: 'create_node',
        id,
        label,
        kind: kind.success ? kind.data : 'process',
        ...(stringValue(operation.description) ? { description: stringValue(operation.description) } : {}),
        ...(stringValue(operation.badge) ? { badge: stringValue(operation.badge) } : {}),
        ...(stringValue(operation.lane) ? { lane: stringValue(operation.lane) } : {}),
        ...(icon.success ? { icon: icon.data } : {}),
        ...(tone.success ? { tone: tone.data } : {}),
        ...(screen.success ? { screen: screen.data } : {}),
        ...(typeof operation.x === 'number' ? { x: operation.x } : {}),
        ...(typeof operation.y === 'number' ? { y: operation.y } : {}),
      })
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
    ? canvasProgramSchema.parse({
      schemaVersion: 1,
      mode,
      summary: stringValue(wire.summary) ?? '',
      operations,
      script: null,
      ...(['workflow', 'prototype', 'board', 'sequence', 'state', 'mindmap', 'er'].includes(String(wire.sceneType)) ? { sceneType: wire.sceneType } : {}),
      ...(stringValue(wire.title) ? { title: stringValue(wire.title) } : {}),
      ...(stringValue(wire.description) ? { description: stringValue(wire.description) } : {}),
    })
    : undefined
}
