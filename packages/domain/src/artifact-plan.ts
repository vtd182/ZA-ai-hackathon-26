import { z } from 'zod'
import { figmaTargetBindingSchema } from './figma-integration'

export const artifactPlanModeSchema = z.enum(['strict', 'free'])
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

export const prototypeEdgeIntentSchema = z.object({
  key: z.string().min(1),
  fromScreenId: z.string().min(1),
  toScreenId: z.string().min(1),
  trigger: z.literal('on_tap'),
  action: z.literal('navigate'),
})
export type PrototypeEdgeIntent = z.infer<typeof prototypeEdgeIntentSchema>

export const designScreenRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  screenId: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).min(1),
  layout: z.enum(['vertical', 'horizontal', 'flow']),
  sequence: z.number().int().nonnegative(),
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
  screens: z.array(designScreenRecipeSchema).min(1),
})
export type FigmaArtifactPlan = z.infer<typeof figmaArtifactPlanSchema>

export const resolvedDesignSlotSchema = z.object({
  screenId: z.string().min(1),
  slotKey: z.string().min(1),
  required: z.boolean(),
  componentKey: z.string().min(1).nullable(),
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

export const artifactNodeSnapshotSchema = z.object({
  nodeId: z.string().min(1),
  screenId: z.string().min(1),
  name: z.string().min(1),
  componentKey: z.string().min(1).nullable(),
  semanticRole: z.string().min(1).nullable(),
  metadata: lifecycleArtifactMetadataSchema.extend({
    screenId: z.string().min(1),
    requirementIds: z.array(z.string().min(1)).min(1),
    planHash: z.string().min(1),
  }),
  childSlots: z.array(z.object({
    slotKey: z.string().min(1),
    componentKey: z.string().min(1).nullable(),
    semanticRole: z.string().min(1).nullable(),
    primitiveFallback: z.boolean(),
  })),
})
export type ArtifactNodeSnapshot = z.infer<typeof artifactNodeSnapshotSchema>

export const figmaArtifactSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  targetHash: z.string().min(1),
  planHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  rootNodeIds: z.array(z.string().min(1)),
  screens: z.array(artifactNodeSnapshotSchema),
  prototypeEdges: z.array(prototypeEdgeIntentSchema),
  readAt: z.string().datetime(),
})
export type FigmaArtifactSnapshot = z.infer<typeof figmaArtifactSnapshotSchema>
