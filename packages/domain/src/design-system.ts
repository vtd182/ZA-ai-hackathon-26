import { z } from 'zod'

export const designSystemComponentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  semanticRole: z.string().min(1),
  variants: z.record(z.string(), z.array(z.string().min(1))),
  deprecated: z.boolean(),
})

const tokenSchema = z.object({ name: z.string().min(1), value: z.string().min(1) })

export const designSystemManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  version: z.string().min(1),
  source: z.enum(['fixture', 'sanitized_export', 'allowed_sandbox']),
  sourceLabel: z.string().min(1),
  capturedAt: z.string().datetime(),
  fingerprint: z.string().min(1),
  components: z.array(designSystemComponentSchema),
  tokens: z.object({
    color: z.array(tokenSchema),
    typography: z.array(tokenSchema),
    spacing: z.array(tokenSchema),
    radius: z.array(tokenSchema),
  }),
  forbiddenRawStyles: z.boolean(),
})
export type DesignSystemManifest = z.infer<typeof designSystemManifestSchema>

