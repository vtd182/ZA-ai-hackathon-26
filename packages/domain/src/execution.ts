import { z } from 'zod'
import { actionReceiptSchema, plannedActionSchema } from './lifecycle'

export const outboxStatusSchema = z.enum([
  'queued',
  'executing',
  'verifying',
  'verified',
  'failed',
  'verification_failed',
])
export type OutboxStatus = z.infer<typeof outboxStatusSchema>

export const outboxItemSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  action: plannedActionSchema,
  status: outboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  availableAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type OutboxItem = z.infer<typeof outboxItemSchema>

export const artifactVerificationSchema = z.object({
  schemaVersion: z.literal(1),
  actionId: z.string().min(1),
  verified: z.boolean(),
  issues: z.array(z.object({
    code: z.string().min(1),
    severity: z.enum(['warning', 'error']),
    message: z.string().min(1),
    entityId: z.string().min(1).optional(),
  })),
  verifiedAt: z.string().datetime(),
})
export type ArtifactVerification = z.infer<typeof artifactVerificationSchema>

export const actionExecutionStatusSchema = z.object({
  actionId: z.string().min(1),
  target: z.enum(['figma', 'jira', 'zdoc']),
  status: outboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  receipt: actionReceiptSchema.nullable(),
  verification: artifactVerificationSchema.nullable(),
})
export type ActionExecutionStatus = z.infer<typeof actionExecutionStatusSchema>

export const executionSummarySchema = z.object({
  runId: z.string().min(1),
  status: z.enum(['idle', 'queued', 'executing', 'verified', 'partial_failure']),
  actions: z.array(actionExecutionStatusSchema),
})
export type ExecutionSummary = z.infer<typeof executionSummarySchema>

export const artifactExecutionStageSchema = z.enum([
  'planning',
  'availability',
  'preflight',
  'write',
  'read_back',
  'verify',
  'complete',
])
export type ArtifactExecutionStage = z.infer<typeof artifactExecutionStageSchema>

export const artifactProgressEventSchema = z.object({
  schemaVersion: z.literal(1),
  threadId: z.string().min(1),
  target: z.enum(['figma', 'jira', 'zdoc']),
  stage: artifactExecutionStageSchema,
  status: z.enum(['running', 'completed', 'failed']),
  stageElapsedMs: z.number().int().nonnegative(),
  totalElapsedMs: z.number().int().nonnegative(),
  message: z.string().min(1),
  at: z.string().datetime(),
})
export type ArtifactProgressEvent = z.infer<typeof artifactProgressEventSchema>
