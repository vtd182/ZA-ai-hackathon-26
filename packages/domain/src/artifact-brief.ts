import { z } from 'zod'
import type { ArtifactPlanMode } from './artifact-plan'
import type { ProductSpec } from './product-spec'

export const productSurfaceSchema = z.enum([
  'mini_app',
  'oa',
  'bot',
  'web_app',
  'admin_dashboard',
  'landing_page',
  'desktop_tool',
  'adaptive',
])
export type ProductSurface = z.infer<typeof productSurfaceSchema>

export const artifactBriefTargetSchema = z.enum(['figma', 'jira', 'zdoc'])
export type ArtifactBriefTarget = z.infer<typeof artifactBriefTargetSchema>

export const artifactBriefModeSchema = z.enum(['zds_strict', 'zds_reference', 'free_adaptive', 'mock'])
export type ArtifactBriefMode = z.infer<typeof artifactBriefModeSchema>

export const artifactBriefFidelitySchema = z.enum(['flow', 'wireframe', 'product_grade'])
export type ArtifactBriefFidelity = z.infer<typeof artifactBriefFidelitySchema>

export const artifactBriefOutputPolicySchema = z.enum(['selected_page', 'managed_page', 'mock_store'])
export type ArtifactBriefOutputPolicy = z.infer<typeof artifactBriefOutputPolicySchema>

export const artifactBriefDesignSystemPolicySchema = z.enum(['required', 'reference', 'none'])
export type ArtifactBriefDesignSystemPolicy = z.infer<typeof artifactBriefDesignSystemPolicySchema>

export const artifactBriefSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  sourceSpecId: z.string().min(1),
  sourceSpecVersion: z.number().int().positive(),
  sourcePayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  target: artifactBriefTargetSchema,
  mode: artifactBriefModeSchema,
  surface: productSurfaceSchema,
  fidelity: artifactBriefFidelitySchema,
  outputPolicy: artifactBriefOutputPolicySchema,
  designSystemPolicy: artifactBriefDesignSystemPolicySchema,
  verificationPolicy: z.array(z.string().min(1)).min(1),
  notes: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
})
export type ArtifactBrief = z.infer<typeof artifactBriefSchema>

export interface CreateArtifactBriefInput {
  spec: ProductSpec
  target: ArtifactBriefTarget
  sourcePayloadHash: string
  createdAt: string
  figma?: {
    connectorMode: 'live' | 'mock'
    planMode: ArtifactPlanMode
    pageStrategy: 'create_new' | 'create_or_recover_incomplete' | 'create_or_reuse_managed' | 'use_target_page'
  }
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
}

export function inferProductSurface(spec: ProductSpec): ProductSurface {
  const explicit = spec.findings.find((finding) => finding.id === 'FINDING-PRODUCT-SURFACE')?.evidence
  if (explicit && productSurfaceSchema.safeParse(explicit).success) return explicit as ProductSurface
  const text = normalized([
    spec.title,
    spec.idea.title,
    spec.idea.summary,
    ...spec.requirements.flatMap((item) => [item.title, item.description]),
    ...spec.screens.flatMap((item) => [item.title, item.purpose]),
  ].join(' '))
  if (/\b(admin|dashboard|backoffice|ops|van hanh|quan tri|booking)\b/.test(text)) return 'admin_dashboard'
  if (/\b(landing|marketing|website|trang web|hero)\b/.test(text)) return 'landing_page'
  if (/\b(web app|web|portal|crm|saas)\b/.test(text)) return 'web_app'
  if (/\b(desktop|tool|console)\b/.test(text)) return 'desktop_tool'
  if (spec.idea.productType === 'oa') return 'oa'
  if (spec.idea.productType === 'bot') return 'bot'
  if (spec.idea.productType === 'mini_app') return 'mini_app'
  return 'adaptive'
}

function figmaMode(planMode: ArtifactPlanMode, connectorMode: 'live' | 'mock'): ArtifactBriefMode {
  if (connectorMode === 'mock') return 'mock'
  if (planMode === 'strict') return 'zds_strict'
  if (planMode === 'reference') return 'zds_reference'
  return 'free_adaptive'
}

function figmaOutputPolicy(input: NonNullable<CreateArtifactBriefInput['figma']>): ArtifactBriefOutputPolicy {
  if (input.connectorMode === 'mock') return 'mock_store'
  return input.pageStrategy === 'use_target_page' ? 'selected_page' : 'managed_page'
}

function figmaDesignSystemPolicy(planMode: ArtifactPlanMode): ArtifactBriefDesignSystemPolicy {
  if (planMode === 'strict') return 'required'
  if (planMode === 'reference') return 'reference'
  return 'none'
}

function figmaVerificationPolicy(input: NonNullable<CreateArtifactBriefInput['figma']>): string[] {
  const policy = ['preflight', 'approval_payload_hash', 'write_receipt', 'read_back', 'postflight_audit']
  if (input.connectorMode === 'mock') policy.push('mock_store_read_back')
  if (input.planMode === 'free') policy.push('primitive_composition_allowed')
  if (input.planMode === 'strict') policy.push('zds_role_coverage_required')
  return policy
}

export function createArtifactBrief(input: CreateArtifactBriefInput): ArtifactBrief {
  const surface = inferProductSurface(input.spec)
  if (input.target === 'figma') {
    if (!input.figma) throw new Error('Figma ArtifactBrief requires figma execution context')
    const mode = figmaMode(input.figma.planMode, input.figma.connectorMode)
    return artifactBriefSchema.parse({
      schemaVersion: 1,
      id: `artifact:${input.spec.id}:v${input.spec.version}:figma:${mode}:${input.sourcePayloadHash.slice(0, 12)}`,
      sourceSpecId: input.spec.id,
      sourceSpecVersion: input.spec.version,
      sourcePayloadHash: input.sourcePayloadHash,
      target: input.target,
      mode,
      surface,
      fidelity: 'product_grade',
      outputPolicy: figmaOutputPolicy(input.figma),
      designSystemPolicy: figmaDesignSystemPolicy(input.figma.planMode),
      verificationPolicy: figmaVerificationPolicy(input.figma),
      notes: [
        input.figma.planMode === 'free'
          ? 'No-ZDS/free mode: provider and worker should not receive component roles.'
          : 'ZDS mode: provider may use allowed semantic roles for interaction controls.',
        input.figma.pageStrategy === 'use_target_page'
          ? 'Write into the selected allowlisted Figma page.'
          : 'Write into a managed PM Lifecycle artifact page.',
      ],
      createdAt: input.createdAt,
    })
  }
  return artifactBriefSchema.parse({
    schemaVersion: 1,
    id: `artifact:${input.spec.id}:v${input.spec.version}:${input.target}:${input.sourcePayloadHash.slice(0, 12)}`,
    sourceSpecId: input.spec.id,
    sourceSpecVersion: input.spec.version,
    sourcePayloadHash: input.sourcePayloadHash,
    target: input.target,
    mode: 'mock',
    surface,
    fidelity: 'product_grade',
    outputPolicy: 'mock_store',
    designSystemPolicy: 'none',
    verificationPolicy: ['preflight', 'approval_payload_hash', 'write_receipt', 'read_back'],
    notes: ['Mock connector keeps contract parity until the live integration is enabled.'],
    createdAt: input.createdAt,
  })
}
