import { z } from 'zod'

const nullableString = z.string().nullable()
const nullableNumber = z.number().finite().nullable()

export const figmaCreativeElementKindSchema = z.enum([
  'frame',
  'text',
  'rectangle',
  'ellipse',
  'component',
  'divider',
])
export type FigmaCreativeElementKind = z.infer<typeof figmaCreativeElementKindSchema>

export const figmaCreativeElementSchema = z.object({
  id: z.string().min(1).max(100),
  kind: figmaCreativeElementKindSchema,
  parentId: nullableString,
  name: z.string().min(1).max(120),
  x: nullableNumber,
  y: nullableNumber,
  width: z.number().positive().max(2_000),
  height: z.number().positive().max(2_000),
  layout: z.enum(['none', 'vertical', 'horizontal']),
  gap: z.number().min(0).max(120),
  paddingTop: z.number().min(0).max(160),
  paddingRight: z.number().min(0).max(160),
  paddingBottom: z.number().min(0).max(160),
  paddingLeft: z.number().min(0).max(160),
  fill: nullableString,
  stroke: nullableString,
  strokeWidth: z.number().min(0).max(20),
  radius: z.number().min(0).max(200),
  opacity: z.number().min(0).max(1),
  text: nullableString,
  fontSize: nullableNumber,
  fontWeight: z.enum(['regular', 'medium', 'semibold', 'bold']).nullable(),
  textAlign: z.enum(['left', 'center', 'right']).nullable(),
  componentRole: nullableString,
  componentText: nullableString,
  layoutGrow: z.number().min(0).max(1),
})
export type FigmaCreativeElement = z.infer<typeof figmaCreativeElementSchema>

export const figmaCreativeScreenSchema = z.object({
  screenId: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  purpose: z.string().min(1).max(240),
  requirementIds: z.array(z.string().min(1)).min(1),
  width: z.number().min(320).max(1_440),
  height: z.number().min(568).max(1_600),
  background: z.string().min(1).max(32),
  presentationNote: z.string().min(1).max(240),
  elements: z.array(figmaCreativeElementSchema).min(2).max(32),
})
export type FigmaCreativeScreen = z.infer<typeof figmaCreativeScreenSchema>

export const prototypeTransitionSchema = z.object({
  type: z.enum(['instant', 'dissolve', 'smart_animate', 'move_in', 'slide_in', 'push']).default('smart_animate'),
  direction: z.enum(['left', 'right', 'top', 'bottom']).default('left'),
  durationMs: z.number().int().min(0).max(3000).default(240),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).default('ease_out'),
})
export type PrototypeTransition = z.infer<typeof prototypeTransitionSchema>

export const figmaCreativePrototypeEdgeSchema = z.object({
  key: z.string().min(1).max(160),
  fromElementId: z.string().min(1).max(100),
  fromScreenId: z.string().min(1).max(100),
  toScreenId: z.string().min(1).max(100),
  trigger: z.enum(['on_tap', 'on_hover', 'after_delay']).default('on_tap'),
  action: z.enum(['navigate', 'open_overlay', 'scroll_to']).default('navigate'),
  delayMs: z.number().int().min(0).max(10000).optional(),
  transition: prototypeTransitionSchema.optional(),
})
export type FigmaCreativePrototypeEdge = z.infer<typeof figmaCreativePrototypeEdgeSchema>

export const figmaCreativeBlueprintSchema = z.object({
  schemaVersion: z.literal(1),
  conceptName: z.string().min(1).max(100),
  productPromise: z.string().min(1).max(240),
  visualNarrative: z.string().min(1).max(500),
  principles: z.array(z.string().min(1).max(180)).min(2).max(5),
  screens: z.array(figmaCreativeScreenSchema).min(1).max(40),
  prototypeEdges: z.array(figmaCreativePrototypeEdgeSchema).max(80),
})
export type FigmaCreativeBlueprint = z.infer<typeof figmaCreativeBlueprintSchema>

const elementJsonProperties = {
  id: { type: 'string' },
  kind: { type: 'string', enum: figmaCreativeElementKindSchema.options },
  parentId: { type: ['string', 'null'] },
  name: { type: 'string' },
  x: { type: ['number', 'null'] },
  y: { type: ['number', 'null'] },
  width: { type: 'number' },
  height: { type: 'number' },
  layout: { type: 'string', enum: ['none', 'vertical', 'horizontal'] },
  gap: { type: 'number' },
  paddingTop: { type: 'number' },
  paddingRight: { type: 'number' },
  paddingBottom: { type: 'number' },
  paddingLeft: { type: 'number' },
  fill: { type: ['string', 'null'] },
  stroke: { type: ['string', 'null'] },
  strokeWidth: { type: 'number' },
  radius: { type: 'number' },
  opacity: { type: 'number' },
  text: { type: ['string', 'null'] },
  fontSize: { type: ['number', 'null'] },
  fontWeight: { type: ['string', 'null'], enum: ['regular', 'medium', 'semibold', 'bold', null] },
  textAlign: { type: ['string', 'null'], enum: ['left', 'center', 'right', null] },
  componentRole: { type: ['string', 'null'] },
  componentText: { type: ['string', 'null'] },
  layoutGrow: { type: 'number' },
} as const

export const figmaCreativeBlueprintJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'conceptName', 'productPromise', 'visualNarrative', 'principles', 'screens', 'prototypeEdges'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    conceptName: { type: 'string' },
    productPromise: { type: 'string' },
    visualNarrative: { type: 'string' },
    principles: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } },
    screens: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['screenId', 'name', 'purpose', 'requirementIds', 'width', 'height', 'background', 'presentationNote', 'elements'],
        properties: {
          screenId: { type: 'string' },
          name: { type: 'string' },
          purpose: { type: 'string' },
          requirementIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          width: { type: 'number' },
          height: { type: 'number' },
          background: { type: 'string' },
          presentationNote: { type: 'string' },
          elements: {
            type: 'array',
            minItems: 2,
            maxItems: 18,
            items: {
              type: 'object',
              additionalProperties: false,
              required: Object.keys(elementJsonProperties),
              properties: elementJsonProperties,
            },
          },
        },
      },
    },
    prototypeEdges: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'fromElementId', 'fromScreenId', 'toScreenId', 'trigger', 'action'],
        properties: {
          key: { type: 'string' },
          fromElementId: { type: 'string' },
          fromScreenId: { type: 'string' },
          toScreenId: { type: 'string' },
          trigger: { type: 'string', enum: ['on_tap', 'on_hover', 'after_delay'] },
          action: { type: 'string', enum: ['navigate', 'open_overlay', 'scroll_to'] },
          delayMs: { type: 'number' },
          transition: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['instant', 'dissolve', 'smart_animate', 'move_in', 'slide_in', 'push'] },
              direction: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
              durationMs: { type: 'number' },
              easing: { type: 'string', enum: ['linear', 'ease_in', 'ease_out', 'ease_in_out'] },
            },
          },
        },
      },
    },
  },
} as const

export function validateFigmaCreativeBlueprintStructure(value: unknown): FigmaCreativeBlueprint {
  const blueprint = figmaCreativeBlueprintSchema.parse(value)
  const screenIds = new Set<string>()
  const elementIds = new Set<string>()
  const screenElements = new Map<string, Set<string>>()

  for (const screen of blueprint.screens) {
    if (screenIds.has(screen.screenId)) throw new Error(`Duplicate creative screen id: ${screen.screenId}`)
    screenIds.add(screen.screenId)
    const localIds = new Set<string>()
    for (const element of screen.elements) {
      if (localIds.has(element.id) || elementIds.has(element.id)) {
        throw new Error(`Duplicate creative element id: ${element.id}`)
      }
      if (element.parentId && !localIds.has(element.parentId)) {
        throw new Error(`Creative element ${element.id} references a parent that is missing or declared later: ${element.parentId}`)
      }
      if (element.kind === 'component' && !element.componentRole) {
        throw new Error(`Creative component ${element.id} is missing componentRole`)
      }
      if (element.kind === 'text' && !element.text?.trim()) {
        throw new Error(`Creative text ${element.id} has no content`)
      }
      localIds.add(element.id)
      elementIds.add(element.id)
    }
    screenElements.set(screen.screenId, localIds)
  }

  for (const edge of blueprint.prototypeEdges) {
    if (!screenIds.has(edge.fromScreenId) || !screenIds.has(edge.toScreenId)) {
      throw new Error(`Creative prototype edge ${edge.key} references an unknown screen`)
    }
    if (!screenElements.get(edge.fromScreenId)?.has(edge.fromElementId)) {
      throw new Error(`Creative prototype edge ${edge.key} references an unknown source element`)
    }
  }
  return blueprint
}
