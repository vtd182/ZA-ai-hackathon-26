import { z } from 'zod'
import { designSystemManifestSchema } from './design-system'

export const figmaSessionSchema = z.object({
  sessionId: z.string().min(1),
  fileName: z.string().min(1),
  pageName: z.string().min(1),
  selectionCount: z.number().int().nonnegative(),
})
export type FigmaSession = z.infer<typeof figmaSessionSchema>

export const figmaRuntimeHealthSchema = z.object({
  role: z.enum(['LEADER', 'FOLLOWER', 'UNKNOWN']),
  version: z.string(),
  clientId: z.string(),
  logLevel: z.string(),
  pluginConnected: z.boolean(),
  leaderReachable: z.boolean(),
  activeSession: z.string(),
  sessionCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  sessions: z.array(figmaSessionSchema).default([]),
})
export type FigmaRuntimeHealth = z.infer<typeof figmaRuntimeHealthSchema>

export const figmaPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})
export type FigmaPage = z.infer<typeof figmaPageSchema>

export const figmaPagesSchema = z.object({
  currentPageId: z.string().min(1),
  pages: z.array(figmaPageSchema),
})
export type FigmaPages = z.infer<typeof figmaPagesSchema>

export const figmaTargetBindingSchema = z.object({
  schemaVersion: z.literal(1),
  targetHash: z.string().regex(/^[a-f0-9]{64}$/),
  sessionId: z.string().min(1),
  fileName: z.string().min(1),
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  allowedAt: z.string().datetime(),
})
export type FigmaTargetBinding = z.infer<typeof figmaTargetBindingSchema>

export const figmaRuntimeErrorCodeSchema = z.enum([
  'PLUGIN_NOT_CONNECTED',
  'TIMEOUT',
  'CANCELED',
  'TRANSPORT_ERROR',
  'PLUGIN_ERROR',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
])
export type FigmaRuntimeErrorCode = z.infer<typeof figmaRuntimeErrorCodeSchema>

export const figmaRuntimeErrorEnvelopeSchema = z.object({
  error: z.object({
    code: figmaRuntimeErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
})

const figmaRawComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string().optional(),
  componentSetId: z.string().optional(),
  variantProperties: z.record(z.string(), z.unknown()).optional(),
})

const figmaCatalogInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal('INSTANCE'),
  pageId: z.string(),
  mainComponentId: z.string().nullable().optional(),
  mainComponentName: z.string().nullable().optional(),
  mainComponentKey: z.string().nullable().optional(),
  componentProperties: z.record(z.string(), z.string()).default({}),
  contextLabels: z.array(z.string()).default([]),
  ancestorNames: z.array(z.string()).default([]),
})

export const figmaDesignSystemCaptureSchema = z.object({
  sourceRoot: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  }),
  relevantComponents: z.array(figmaRawComponentSchema).default([]),
  relevantComponentSets: z.array(z.object({
    id: z.string(),
    name: z.string(),
    key: z.string().optional(),
  })).default([]),
  relevantInstances: z.array(figmaCatalogInstanceSchema).default([]),
  styles: z.unknown(),
  variables: z.unknown(),
  textNodes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    characters: z.string().optional(),
    fontSize: z.unknown().optional(),
    fontName: z.unknown().optional(),
  })).default([]),
  semanticHints: z.array(z.object({
    componentId: z.string(),
    name: z.string(),
    roles: z.array(z.string()),
  })).default([]),
  warnings: z.array(z.string()).default([]),
  executionReports: z.array(z.unknown()).default([]),
  scannedNodes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  }).passthrough()).default([]),
})
export type FigmaDesignSystemCapture = z.infer<typeof figmaDesignSystemCaptureSchema>

export const figmaDesignSystemContextSchema = z.object({
  schemaVersion: z.literal(1),
  target: figmaTargetBindingSchema,
  mode: z.enum(['live', 'fixture_fallback']),
  manifest: designSystemManifestSchema,
  liveSummary: z.object({
    sourceRootId: z.string(),
    sourceRootName: z.string(),
    componentCount: z.number().int().nonnegative(),
    componentSetCount: z.number().int().nonnegative(),
    paintStyleCount: z.number().int().nonnegative(),
    textStyleCount: z.number().int().nonnegative(),
    variableCollectionCount: z.number().int().nonnegative(),
    textNodeCount: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  }),
  fallbackReason: z.string().nullable(),
  capturedAt: z.string().datetime(),
})
export type FigmaDesignSystemContext = z.infer<typeof figmaDesignSystemContextSchema>

export const figmaDesignSystemContextSummarySchema = z.object({
  mode: figmaDesignSystemContextSchema.shape.mode,
  source: designSystemManifestSchema.shape.source,
  sourceLabel: z.string(),
  version: z.string(),
  fingerprint: z.string(),
  componentCount: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
  liveComponentCount: z.number().int().nonnegative(),
  fallbackReason: z.string().nullable(),
  capturedAt: z.string().datetime(),
})
export type FigmaDesignSystemContextSummary = z.infer<typeof figmaDesignSystemContextSummarySchema>

export function summarizeFigmaDesignSystemContext(context: FigmaDesignSystemContext): FigmaDesignSystemContextSummary {
  const tokenCount = Object.values(context.manifest.tokens).reduce((total, tokens) => total + tokens.length, 0)
  return figmaDesignSystemContextSummarySchema.parse({
    mode: context.mode,
    source: context.manifest.source,
    sourceLabel: context.manifest.sourceLabel,
    version: context.manifest.version,
    fingerprint: context.manifest.fingerprint,
    componentCount: context.manifest.components.length,
    tokenCount,
    liveComponentCount: context.liveSummary.componentCount,
    fallbackReason: context.fallbackReason,
    capturedAt: context.capturedAt,
  })
}
