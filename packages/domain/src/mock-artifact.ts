import { z } from 'zod'
import { lifecycleArtifactMetadataSchema } from './artifact-plan'

export const mockJiraStoryPlanSchema = z.object({
  storyId: z.string().min(1),
  title: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  status: z.enum(['active', 'removed']),
})

export const mockJiraPlanSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('mock_jira_plan'),
  metadata: lifecycleArtifactMetadataSchema,
  epic: z.object({
    title: z.string().min(1),
    requirementIds: z.array(z.string().min(1)).min(1),
  }),
  stories: z.array(mockJiraStoryPlanSchema).min(1),
})
export type MockJiraPlan = z.infer<typeof mockJiraPlanSchema>

export const mockJiraSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  externalId: z.string().min(1),
  planHash: z.string().min(1),
  payloadHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  epic: mockJiraPlanSchema.shape.epic.extend({ key: z.string().min(1) }),
  stories: z.array(mockJiraStoryPlanSchema.extend({ key: z.string().min(1), epicKey: z.string().min(1) })),
  readAt: z.string().datetime(),
})
export type MockJiraSnapshot = z.infer<typeof mockJiraSnapshotSchema>

export const mockZdocRequirementSectionSchema = z.object({
  requirementId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.string().min(1),
  status: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  screenIds: z.array(z.string().min(1)),
  storyIds: z.array(z.string().min(1)),
})

export const mockZdocPlanSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('mock_zdoc_plan'),
  metadata: lifecycleArtifactMetadataSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  requirementSections: z.array(mockZdocRequirementSectionSchema).min(1),
})
export type MockZdocPlan = z.infer<typeof mockZdocPlanSchema>

export const mockZdocSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  externalId: z.string().min(1),
  planHash: z.string().min(1),
  payloadHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  title: z.string().min(1),
  specVersion: z.number().int().positive(),
  summary: z.string().min(1),
  requirementSections: z.array(mockZdocRequirementSectionSchema).min(1),
  traceability: z.object({
    specId: z.string().min(1),
    runId: z.string().min(1),
    requirementIds: z.array(z.string().min(1)).min(1),
  }),
  readAt: z.string().datetime(),
})
export type MockZdocSnapshot = z.infer<typeof mockZdocSnapshotSchema>
