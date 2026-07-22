import { z } from 'zod'
import { productSpecSchema } from './product-spec'

export const lifecyclePhaseSchema = z.enum(['IDEA_INTAKE', 'DISCOVERY', 'DECISION', 'DELIVERY', 'CHANGE_IMPACT'])
export const runStatusSchema = z.enum([
  'ACTIVE',
  'WAITING_FOR_DECISION',
  'WAITING_FOR_APPROVAL',
  'EXECUTING',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
  'PARTIAL_FAILURE',
])

export const changeIntentSchema = z.object({
  id: z.string().min(1),
  operation: z.enum(['remove', 'restore', 'change_priority']),
  targetEntityId: z.string().min(1),
  reason: z.string().min(1),
})
export type ChangeIntent = z.infer<typeof changeIntentSchema>

export const plannedActionStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'queued',
  'executing',
  'completed',
  'verifying',
  'verified',
  'failed',
  'verification_failed',
  'cancelled',
])

export const plannedActionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  runId: z.string().min(1),
  target: z.enum(['figma', 'jira', 'zdoc']),
  operation: z.enum(['create', 'update', 'remove']),
  entityIds: z.array(z.string().min(1)).min(1),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: z.string().min(1),
  status: plannedActionStatusSchema,
})
export type PlannedAction = z.infer<typeof plannedActionSchema>

export const approvalSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  actionId: z.string().min(1),
  payloadHash: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  approver: z.literal('local_user'),
  decidedAt: z.string().datetime(),
})
export type Approval = z.infer<typeof approvalSchema>

export const actionReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  actionId: z.string().min(1),
  target: z.enum(['figma', 'jira', 'zdoc']),
  externalId: z.string().min(1),
  payloadHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  recordedAt: z.string().datetime(),
})
export type ActionReceipt = z.infer<typeof actionReceiptSchema>

export const runStateSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  threadId: z.string().min(1),
  phase: lifecyclePhaseSchema,
  status: runStatusSchema,
  productSpec: productSpecSchema,
  pendingIntent: changeIntentSchema.nullable(),
  pendingActions: z.array(plannedActionSchema),
  lastCheckpointAt: z.string().datetime(),
})
export type RunState = z.infer<typeof runStateSchema>

