import { z } from 'zod'
import { figmaTargetBindingSchema } from './figma-integration'
import { designSystemComponentBindingSchema } from './design-system'
import { figmaCreativeBlueprintSchema, prototypeTransitionSchema } from './figma-creative'

// strict     — hard-block if any required ZDS role is missing (guarded compliance).
// reference  — prefer the configured ZDS ref; fall back to a labeled creative primitive for
//              anything the ref lacks, and never block the flow.
// free       — no ref: full creative composition, no binding requirement.
export const artifactPlanModeSchema = z.enum(['strict', 'reference', 'free'])
export type ArtifactPlanMode = z.infer<typeof artifactPlanModeSchema>

export const designSlotSchema: z.ZodType<DesignSlot> = z.lazy(() => z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  requiredRoles: z.array(z.string().min(1)).min(1),
  preferredRoles: z.array(z.string().min(1)).default([]),
  variantProperties: z.record(z.string(), z.string()).default({}),
  content: z.record(z.string(), z.string()).default({}),
  children: z.array(designSlotSchema).default([]),
}))

export interface DesignSlot {
  key: string
  label: string
  required: boolean
  requiredRoles: string[]
  preferredRoles: string[]
  variantProperties: Record<string, string>
  content: Record<string, string>
  children: DesignSlot[]
}

// Backward compatible: existing edges (trigger on_tap / action navigate) still parse; the
// richer trigger/action/transition fields are optional and drive real Figma reactions.
// navigate / open_overlay / scroll_to all resolve to a NODE action with a destinationId, so
// read-back edge derivation stays intact.
export const prototypeEdgeIntentSchema = z.object({
  key: z.string().min(1),
  fromScreenId: z.string().min(1),
  toScreenId: z.string().min(1),
  trigger: z.enum(['on_tap', 'on_hover', 'after_delay']).default('on_tap'),
  action: z.enum(['navigate', 'open_overlay', 'scroll_to']).default('navigate'),
  delayMs: z.number().int().min(0).max(10000).optional(),
  transition: prototypeTransitionSchema.optional(),
})
export type PrototypeEdgeIntent = z.infer<typeof prototypeEdgeIntentSchema>

export const figmaDesignDirectionSchema = z.object({
  conceptName: z.string().min(1).max(80),
  productPromise: z.string().min(1).max(180),
  tone: z.enum(['calm', 'confident', 'energetic', 'warm', 'focused']),
  density: z.enum(['airy', 'comfortable', 'compact']),
  palette: z.enum(['zalo-blue', 'trust-green', 'signal-violet', 'warm-coral']),
  principles: z.array(z.object({
    title: z.string().min(1).max(80),
    detail: z.string().min(1).max(180),
  })).min(2).max(4),
})
export type FigmaDesignDirection = z.infer<typeof figmaDesignDirectionSchema>

export const designContentSectionSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(['status', 'metric_grid', 'choice_list', 'timeline', 'info', 'progress', 'confirmation']),
  title: z.string().min(1).max(100),
  body: z.string().max(240).default(''),
  tone: z.enum(['brand', 'success', 'warning', 'neutral', 'accent']).default('neutral'),
  items: z.array(z.object({
    label: z.string().min(1).max(100),
    value: z.string().min(1).max(140),
  })).max(5).default([]),
})
export type DesignContentSection = z.infer<typeof designContentSectionSchema>

export const designScreenPresentationSchema = z.object({
  archetype: z.enum(['dashboard', 'selection', 'configuration', 'interrupt', 'result', 'form', 'browse', 'review']),
  eyebrow: z.string().min(1).max(80),
  headline: z.string().min(1).max(100),
  supportingText: z.string().min(1).max(240),
  sections: z.array(designContentSectionSchema).min(1).max(5),
  navigationLabel: z.string().min(1).max(80),
})
export type DesignScreenPresentation = z.infer<typeof designScreenPresentationSchema>

export const designScreenRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  screenId: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).min(1),
  layout: z.enum(['vertical', 'horizontal', 'flow']),
  sequence: z.number().int().nonnegative(),
  presentation: designScreenPresentationSchema,
  slots: z.array(designSlotSchema).min(1),
  prototypeEdges: z.array(prototypeEdgeIntentSchema),
})
export type DesignScreenRecipe = z.infer<typeof designScreenRecipeSchema>

export const lifecycleArtifactMetadataSchema = z.object({
  namespace: z.literal('za.pm-lifecycle/v1'),
  runId: z.string().min(1),
  threadId: z.string().min(1),
  actionId: z.string().min(1),
  specId: z.string().min(1),
  specVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  artifactPageName: z.string().min(1).max(80).optional(),
  pageStrategy: z.enum([
    'create_new',
    'create_or_recover_incomplete',
    'create_or_reuse_managed',
    'use_target_page',
  ]).optional(),
})
export type LifecycleArtifactMetadata = z.infer<typeof lifecycleArtifactMetadataSchema>

export const figmaArtifactPlanSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('figma_design_system_plan'),
  mode: artifactPlanModeSchema,
  target: figmaTargetBindingSchema,
  manifestFingerprint: z.string().min(1),
  requiredTokens: z.array(z.string().min(1)),
  metadata: lifecycleArtifactMetadataSchema,
  designDirection: figmaDesignDirectionSchema,
  creativeBlueprint: figmaCreativeBlueprintSchema.optional(),
  screens: z.array(designScreenRecipeSchema).min(1),
})
export type FigmaArtifactPlan = z.infer<typeof figmaArtifactPlanSchema>

export const resolvedDesignSlotSchema = z.object({
  screenId: z.string().min(1),
  slotKey: z.string().min(1),
  required: z.boolean(),
  componentKey: z.string().min(1).nullable(),
  componentBinding: designSystemComponentBindingSchema.nullable().default(null),
  semanticRole: z.string().min(1).nullable(),
  resolution: z.enum(['component', 'primitive_fallback', 'missing']),
})
export type ResolvedDesignSlot = z.infer<typeof resolvedDesignSlotSchema>

export const figmaPreflightPlanSchema = z.object({
  schemaVersion: z.literal(1),
  source: figmaArtifactPlanSchema,
  resolvedSlots: z.array(resolvedDesignSlotSchema),
  resolvedTokens: z.array(z.string().min(1)),
  estimatedOperations: z.number().int().nonnegative(),
})
export type FigmaPreflightPlan = z.infer<typeof figmaPreflightPlanSchema>

export const artifactIssueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['warning', 'error']),
  message: z.string().min(1),
  entityId: z.string().min(1).optional(),
})
export type ArtifactIssue = z.infer<typeof artifactIssueSchema>

export const figmaPreflightResultSchema = z.object({
  allowed: z.boolean(),
  plan: figmaPreflightPlanSchema,
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  issues: z.array(artifactIssueSchema),
})
export type FigmaPreflightResult = z.infer<typeof figmaPreflightResultSchema>

export const artifactNodeSnapshotSchema = z.object({
  nodeId: z.string().min(1),
  screenId: z.string().min(1),
  name: z.string().min(1),
  archetype: designScreenPresentationSchema.shape.archetype,
  sectionKeys: z.array(z.string().min(1)),
  componentKey: z.string().min(1).nullable(),
  semanticRole: z.string().min(1).nullable(),
  creativeMetrics: z.object({
    elementCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative(),
    primitiveCount: z.number().int().nonnegative(),
    textCount: z.number().int().nonnegative(),
  }).optional(),
  metadata: lifecycleArtifactMetadataSchema.extend({
    screenId: z.string().min(1),
    requirementIds: z.array(z.string().min(1)).min(1),
    planHash: z.string().min(1),
  }),
  childSlots: z.array(z.object({
    slotKey: z.string().min(1),
    componentKey: z.string().min(1).nullable(),
    componentBinding: designSystemComponentBindingSchema.nullable().default(null),
    semanticRole: z.string().min(1).nullable(),
    primitiveFallback: z.boolean(),
    instanceBacked: z.boolean().default(false),
  })),
})
export type ArtifactNodeSnapshot = z.infer<typeof artifactNodeSnapshotSchema>

export const figmaArtifactSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  targetHash: z.string().min(1),
  planHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  rootNodeIds: z.array(z.string().min(1)),
  artifactPageId: z.string().min(1),
  artifactPageName: z.string().min(1),
  designConceptName: z.string(),
  screens: z.array(artifactNodeSnapshotSchema),
  prototypeEdges: z.array(prototypeEdgeIntentSchema),
  readAt: z.string().datetime(),
})
export type FigmaArtifactSnapshot = z.infer<typeof figmaArtifactSnapshotSchema>

export const figmaApplyResultSchema = z.object({
  schemaVersion: z.literal(1),
  rootNodeIds: z.array(z.string().min(1)).min(1),
  artifactPageId: z.string().min(1),
  artifactPageName: z.string().min(1),
  idempotent: z.boolean(),
})
export type FigmaApplyResult = z.infer<typeof figmaApplyResultSchema>

export const figmaArtifactAuditResultSchema = z.object({
  verified: z.boolean(),
  issues: z.array(artifactIssueSchema),
  snapshot: figmaArtifactSnapshotSchema,
})
export type FigmaArtifactAuditResult = z.infer<typeof figmaArtifactAuditResultSchema>
