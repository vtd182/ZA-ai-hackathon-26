import { z } from 'zod'

export const productSpecSchemaVersion = 1 as const

export const productTypeSchema = z.enum([
  'mini_app',
  'oa',
  'bot',
  'web_app',
  'admin_dashboard',
  'landing_page',
  'desktop_tool',
  'adaptive',
])
export type ProductType = z.infer<typeof productTypeSchema>

export const entityKindSchema = z.enum([
  'idea',
  'goal',
  'finding',
  'requirement',
  'screen',
  'story',
  'dependency',
  'decision',
])
export type EntityKind = z.infer<typeof entityKindSchema>

const stableIdSchema = z.string().regex(/^[A-Z][A-Z0-9-]*$/, 'Stable IDs must use uppercase kebab-case')
const titledEntitySchema = z.object({ id: stableIdSchema, title: z.string().min(1) })

export const productIdeaSchema = titledEntitySchema.extend({
  kind: z.literal('idea'),
  summary: z.string().min(1),
  productType: productTypeSchema,
  targetUsers: z.array(z.string().min(1)).min(1),
})

export const goalSchema = titledEntitySchema.extend({
  kind: z.literal('goal'),
  metric: z.string().min(1),
})

export const findingSchema = titledEntitySchema.extend({
  kind: z.literal('finding'),
  evidence: z.string().min(1),
  sourceType: z.enum(['fixture', 'sanitized_research', 'user_input']),
})

export const requirementSchema = titledEntitySchema.extend({
  kind: z.literal('requirement'),
  description: z.string().min(1),
  priority: z.enum(['must', 'should', 'could', 'wont']),
  status: z.enum(['proposed', 'in_scope', 'removed']),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  dependsOn: z.array(stableIdSchema).default([]),
})

export const screenSchema = titledEntitySchema.extend({
  kind: z.literal('screen'),
  purpose: z.string().min(1),
  requirementIds: z.array(stableIdSchema).min(1),
  designSystemRoles: z.array(z.string().min(1)).default([]),
})

export const storySchema = titledEntitySchema.extend({
  kind: z.literal('story'),
  requirementIds: z.array(stableIdSchema).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
})

export const dependencySchema = titledEntitySchema.extend({
  kind: z.literal('dependency'),
  dependencyType: z.enum(['internal', 'external', 'platform']),
  requirementIds: z.array(stableIdSchema).min(1),
})

export const decisionSchema = titledEntitySchema.extend({
  kind: z.literal('decision'),
  question: z.string().min(1),
  choice: z.string().min(1),
  rationale: z.string().min(1),
  status: z.enum(['proposed', 'accepted', 'rejected']),
})

export const relationshipTypeSchema = z.enum([
  'SUPPORTS',
  'IMPLEMENTS',
  'DESIGNED_BY',
  'DEPENDS_ON',
  'AFFECTS',
])

export const entityRefSchema = z.object({
  kind: entityKindSchema,
  id: stableIdSchema,
})

export const relationshipSchema = z.object({
  id: stableIdSchema,
  type: relationshipTypeSchema,
  source: entityRefSchema,
  target: entityRefSchema,
})

export const artifactMappingSchema = z.object({
  id: stableIdSchema,
  target: z.enum(['figma', 'jira', 'zdoc']),
  entityIds: z.array(stableIdSchema).min(1),
  externalId: z.string().min(1).nullable(),
  status: z.enum(['planned', 'synced', 'verified', 'stale']),
  specVersion: z.number().int().positive(),
})

const productSpecBaseSchema = z.object({
  schemaVersion: z.literal(productSpecSchemaVersion),
  id: stableIdSchema,
  version: z.number().int().positive(),
  title: z.string().min(1),
  status: z.enum(['draft', 'approved', 'superseded']),
  idea: productIdeaSchema,
  goals: z.array(goalSchema),
  findings: z.array(findingSchema),
  requirements: z.array(requirementSchema),
  screens: z.array(screenSchema),
  stories: z.array(storySchema),
  dependencies: z.array(dependencySchema),
  decisions: z.array(decisionSchema),
  relationships: z.array(relationshipSchema),
  artifactMappings: z.array(artifactMappingSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

type ProductSpecInput = z.infer<typeof productSpecBaseSchema>

function validateReferences(spec: ProductSpecInput, context: z.RefinementCtx): void {
  const entities = [
    spec.idea,
    ...spec.goals,
    ...spec.findings,
    ...spec.requirements,
    ...spec.screens,
    ...spec.stories,
    ...spec.dependencies,
    ...spec.decisions,
  ]
  const ids = new Set<string>()
  const kindsById = new Map<string, EntityKind>()

  for (const entity of entities) {
    if (ids.has(entity.id)) {
      context.addIssue({ code: 'custom', message: `Duplicate entity ID: ${entity.id}`, path: ['id'] })
      continue
    }
    ids.add(entity.id)
    kindsById.set(entity.id, entity.kind)
  }

  const requireReference = (id: string, path: PropertyKey[], expectedKind?: EntityKind): void => {
    if (!ids.has(id)) {
      context.addIssue({ code: 'custom', message: `Dangling entity reference: ${id}`, path })
      return
    }
    if (expectedKind && kindsById.get(id) !== expectedKind) {
      context.addIssue({ code: 'custom', message: `Reference ${id} must target ${expectedKind}`, path })
    }
  }

  spec.requirements.forEach((requirement, index) => {
    requirement.dependsOn.forEach((id, refIndex) => requireReference(id, ['requirements', index, 'dependsOn', refIndex]))
  })
  spec.screens.forEach((screen, index) => {
    screen.requirementIds.forEach((id, refIndex) => requireReference(id, ['screens', index, 'requirementIds', refIndex], 'requirement'))
  })
  spec.stories.forEach((story, index) => {
    story.requirementIds.forEach((id, refIndex) => requireReference(id, ['stories', index, 'requirementIds', refIndex], 'requirement'))
  })
  spec.dependencies.forEach((dependency, index) => {
    dependency.requirementIds.forEach((id, refIndex) => requireReference(id, ['dependencies', index, 'requirementIds', refIndex], 'requirement'))
  })
  spec.relationships.forEach((relationship, index) => {
    requireReference(relationship.source.id, ['relationships', index, 'source', 'id'], relationship.source.kind)
    requireReference(relationship.target.id, ['relationships', index, 'target', 'id'], relationship.target.kind)
  })
  spec.artifactMappings.forEach((mapping, index) => {
    mapping.entityIds.forEach((id, refIndex) => requireReference(id, ['artifactMappings', index, 'entityIds', refIndex]))
    if (mapping.specVersion > spec.version) {
      context.addIssue({ code: 'custom', message: 'Artifact mapping cannot target a future spec version', path: ['artifactMappings', index, 'specVersion'] })
    }
  })
}

export const productSpecSchema = productSpecBaseSchema.superRefine(validateReferences)
export type ProductSpec = z.infer<typeof productSpecSchema>

export function parseProductSpec(input: unknown): ProductSpec {
  return productSpecSchema.parse(input)
}

export function createDraftProductSpec(threadId: string, createdAt: string): ProductSpec {
  const stableSuffix = threadId.toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'LOCAL'
  return parseProductSpec({
    schemaVersion: 1,
    id: `SPEC-${stableSuffix}`,
    version: 1,
    title: 'Ý tưởng đang được làm rõ',
    status: 'draft',
    idea: {
      id: `IDEA-${stableSuffix}`,
      kind: 'idea',
      title: 'Ý tưởng mới',
      summary: 'Nội dung sẽ được chuẩn hóa từ cuộc trò chuyện.',
      productType: 'mini_app',
      targetUsers: ['Chưa xác định'],
    },
    goals: [],
    findings: [],
    requirements: [],
    screens: [],
    stories: [],
    dependencies: [],
    decisions: [],
    relationships: [],
    artifactMappings: [],
    createdAt,
    updatedAt: createdAt,
  })
}
