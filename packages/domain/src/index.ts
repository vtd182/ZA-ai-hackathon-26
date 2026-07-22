import { z } from 'zod'
import type { FigmaSetupStatus } from './figma-setup'
import type { ApproveChangeOutput, ChangePreview, LifecycleWorkspaceState, PlannedAction } from './lifecycle'
import type { ProductSpec } from './product-spec'

export * from './design-system'
export * from './artifact-plan'
export * from './figma-integration'
export * from './figma-setup'
export * from './execution'
export * from './invariants'
export * from './lifecycle'
export * from './mock-artifact'
export * from './product-spec'
export * from './state-machine'

export const workflowViews = ['discover', 'decide', 'deliver', 'change'] as const
export type WorkflowView = (typeof workflowViews)[number]

export const messageRoleSchema = z.enum(['user', 'assistant', 'system'])
export type MessageRole = z.infer<typeof messageRoleSchema>

export const chatMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.string(),
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

export const providerCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_card'), label: z.string().min(1), view: z.enum(workflowViews).optional() }),
  z.object({ type: z.literal('remove_card'), query: z.string().min(1) }),
  z.object({ type: z.literal('focus_card'), query: z.string().min(1) }),
  z.object({ type: z.literal('switch_view'), view: z.enum(workflowViews) }),
])
export type ProviderCommand = z.infer<typeof providerCommandSchema>

export const reasoningResultSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  message: z.string().min(1),
  commands: z.array(providerCommandSchema).default([]),
})
export type ReasoningResult = z.infer<typeof reasoningResultSchema>

const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(3),
})

const phaseResultBase = {
  schemaVersion: z.literal(1),
  message: z.string().min(1),
  commands: z.array(providerCommandSchema),
}

export const discoveryReasoningResultSchema = z.object({
  ...phaseResultBase,
  phase: z.literal('discover'),
  phaseData: z.object({
    questions: z.array(clarificationQuestionSchema).max(3),
    assumptions: z.array(z.string().min(1)).max(5),
  }),
})

export const decisionReasoningResultSchema = z.object({
  ...phaseResultBase,
  phase: z.literal('decide'),
  phaseData: z.object({
    options: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), tradeoff: z.string().min(1) })).min(2).max(3),
    recommendedOptionId: z.string().min(1),
  }).refine((data) => data.options.some((option) => option.id === data.recommendedOptionId), 'Recommendation must reference an option'),
})

export const deliveryReasoningResultSchema = z.object({
  ...phaseResultBase,
  phase: z.literal('deliver'),
  phaseData: z.object({
    artifactTargets: z.array(z.enum(['figma', 'jira', 'zdoc'])).min(1),
    readinessSummary: z.string().min(1),
  }),
})

export const changeReasoningResultSchema = z.object({
  ...phaseResultBase,
  phase: z.literal('change'),
  phaseData: z.object({
    operation: z.enum(['add', 'update', 'remove', 'needs_user_input']),
    targetEntityId: z.string().min(1).nullable(),
    ambiguity: z.string().min(1).nullable(),
  }),
})

export const phaseReasoningResultSchema = z.discriminatedUnion('phase', [
  discoveryReasoningResultSchema,
  decisionReasoningResultSchema,
  deliveryReasoningResultSchema,
  changeReasoningResultSchema,
])
export type PhaseReasoningResult = z.infer<typeof phaseReasoningResultSchema>

export const providerCapabilitiesSchema = z.object({
  structuredOutput: z.boolean(),
  streaming: z.boolean(),
  cancellation: z.boolean(),
  remoteResume: z.boolean(),
  usage: z.boolean(),
})
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>

const providerEventBase = { sequence: z.number().int().nonnegative(), at: z.string().datetime() }
export const providerEventSchema = z.discriminatedUnion('type', [
  z.object({ ...providerEventBase, type: z.literal('turn_started') }),
  z.object({ ...providerEventBase, type: z.literal('text_delta'), delta: z.string() }),
  z.object({ ...providerEventBase, type: z.literal('result'), result: phaseReasoningResultSchema }),
  z.object({ ...providerEventBase, type: z.literal('usage'), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  z.object({ ...providerEventBase, type: z.literal('turn_completed') }),
  z.object({ ...providerEventBase, type: z.literal('turn_cancelled') }),
  z.object({ ...providerEventBase, type: z.literal('turn_failed'), error: z.string().min(1) }),
])
export type ProviderEvent = z.infer<typeof providerEventSchema>

export interface CanvasSelectionContext {
  entityId: string
  label: string
}

export interface ThreadSummary {
  id: string
  title: string
  phase: WorkflowView
  status: 'active' | 'archived'
  providerId: string
  modelId: string
  updatedAt: string
  lastMessage: string | null
}

export interface ThreadDetail extends ThreadSummary {
  canvasSnapshot: unknown | null
  messages: ChatMessage[]
  messageNextCursor: string | null
}

export interface MessagePage {
  items: ChatMessage[]
  nextCursor: string | null
}

export interface ProviderProfile {
  id: string
  providerId: string
  displayName: string
  modelId: string
  costMode: 'mock' | 'subscription' | 'api_paid'
  hasCredential: boolean
  enabled: boolean
}

export interface ProviderProbe {
  available: boolean
  label: string
  detail: string
  capabilities?: ProviderCapabilities
}

export interface SendChatInput {
  threadId: string
  content: string
  selection?: CanvasSelectionContext
}

export interface SendChatOutput {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  commands: ProviderCommand[]
  changePreview?: ChangePreview
}

export interface ConfigureProviderInput {
  profileId: string
  modelId: string
  apiKey?: string
}

export interface DemoResetOutput {
  fixtureVersion: 1
  thread: ThreadDetail
  workspace: LifecycleWorkspaceState
}

export interface HandoffPackage {
  schemaVersion: 1
  threadId: string
  from: { profileId: string; modelId: string }
  to: { profileId: string; modelId: string }
  productSpec: ProductSpec
  run: {
    id: string
    phase: string
    status: string
    specVersion: number
    checkpointAt: string
  }
  recentMessages: ChatMessage[]
  pendingActions: PlannedAction[]
  hasCanvasSnapshot: boolean
  createdAt: string
}

export interface DesktopApi {
  threads: {
    list(query?: string): Promise<ThreadSummary[]>
    create(): Promise<ThreadDetail>
    get(threadId: string): Promise<ThreadDetail>
    archive(threadId: string): Promise<void>
    setProvider(threadId: string, profileId: string, confirmPaid?: boolean): Promise<ThreadDetail>
    messages(threadId: string, cursor?: string, limit?: number): Promise<MessagePage>
  }
  canvas: {
    save(threadId: string, snapshot: unknown): Promise<void>
  }
  lifecycle: {
    getWorkspace(threadId: string): Promise<LifecycleWorkspaceState>
    approveChange(threadId: string): Promise<ApproveChangeOutput>
    rejectChange(threadId: string): Promise<ApproveChangeOutput>
    retryAction(threadId: string, target: PlannedAction['target']): Promise<ApproveChangeOutput>
    advanceDecision(threadId: string, answers: Record<string, string>): Promise<LifecycleWorkspaceState>
    selectDecision(threadId: string, optionId: string): Promise<LifecycleWorkspaceState>
  }
  figma: {
    status(): Promise<FigmaSetupStatus>
    start(): Promise<FigmaSetupStatus>
    allowTarget(sessionId: string): Promise<FigmaSetupStatus>
    refreshDesignSystem(): Promise<FigmaSetupStatus>
    showManifest(): Promise<void>
    openControlPlane(): Promise<void>
  }
  providers: {
    list(): Promise<ProviderProfile[]>
    configure(input: ConfigureProviderInput): Promise<ProviderProfile>
    probe(profileId: string): Promise<ProviderProbe>
  }
  chat: {
    send(input: SendChatInput): Promise<SendChatOutput>
    cancel(threadId: string): Promise<void>
  }
  demo: {
    reset(): Promise<DemoResetOutput>
  }
}

export const reasoningJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'message', 'commands'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    message: { type: 'string' },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'label', 'query', 'view'],
        properties: {
          type: { type: 'string', enum: ['add_card', 'remove_card', 'focus_card', 'switch_view'] },
          label: { type: ['string', 'null'] },
          query: { type: ['string', 'null'] },
          view: { type: ['string', 'null'], enum: [...workflowViews, null] },
        },
      },
    },
  },
} as const

const commandJsonSchema = reasoningJsonSchema.properties.commands
const phaseDataJsonSchemas = {
  discover: {
    type: 'object', additionalProperties: false, required: ['questions', 'assumptions'],
    properties: {
      questions: {
        type: 'array', maxItems: 3, items: {
          type: 'object', additionalProperties: false, required: ['id', 'prompt', 'options'],
          properties: {
            id: { type: 'string' }, prompt: { type: 'string' },
            options: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
          },
        },
      },
      assumptions: { type: 'array', maxItems: 5, items: { type: 'string' } },
    },
  },
  decide: {
    type: 'object', additionalProperties: false, required: ['options', 'recommendedOptionId'],
    properties: {
      options: {
        type: 'array', minItems: 2, maxItems: 3, items: {
          type: 'object', additionalProperties: false, required: ['id', 'title', 'tradeoff'],
          properties: { id: { type: 'string' }, title: { type: 'string' }, tradeoff: { type: 'string' } },
        },
      },
      recommendedOptionId: { type: 'string' },
    },
  },
  deliver: {
    type: 'object', additionalProperties: false, required: ['artifactTargets', 'readinessSummary'],
    properties: {
      artifactTargets: { type: 'array', minItems: 1, items: { type: 'string', enum: ['figma', 'jira', 'zdoc'] } },
      readinessSummary: { type: 'string' },
    },
  },
  change: {
    type: 'object', additionalProperties: false, required: ['operation', 'targetEntityId', 'ambiguity'],
    properties: {
      operation: { type: 'string', enum: ['add', 'update', 'remove', 'needs_user_input'] },
      targetEntityId: { type: ['string', 'null'] },
      ambiguity: { type: ['string', 'null'] },
    },
  },
} as const

export function reasoningJsonSchemaForPhase(phase: WorkflowView): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'phase', 'message', 'commands', 'phaseData'],
    properties: {
      schemaVersion: { type: 'integer', const: 1 },
      phase: { type: 'string', const: phase },
      message: { type: 'string' },
      commands: commandJsonSchema,
      phaseData: phaseDataJsonSchemas[phase],
    },
  }
}

export function parseReasoningResult(value: unknown): ReasoningResult {
  return reasoningResultSchema.parse(value)
}

export function parsePhaseReasoningResult(value: unknown, expectedPhase: WorkflowView): PhaseReasoningResult {
  const schemas = {
    discover: discoveryReasoningResultSchema,
    decide: decisionReasoningResultSchema,
    deliver: deliveryReasoningResultSchema,
    change: changeReasoningResultSchema,
  } as const
  return schemas[expectedPhase].parse(value) as PhaseReasoningResult
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('Provider did not return a JSON object')
  return JSON.parse(candidate)
}
