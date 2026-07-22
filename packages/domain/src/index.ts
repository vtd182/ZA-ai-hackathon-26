import { z } from 'zod'
import type { FigmaSetupStatus } from './figma-setup'
import type { ApproveChangeOutput, ChangePreview, LifecycleWorkspaceState, PlannedAction } from './lifecycle'

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

export interface DesktopApi {
  threads: {
    list(query?: string): Promise<ThreadSummary[]>
    create(): Promise<ThreadDetail>
    get(threadId: string): Promise<ThreadDetail>
    archive(threadId: string): Promise<void>
    setProvider(threadId: string, profileId: string): Promise<ThreadDetail>
  }
  canvas: {
    save(threadId: string, snapshot: unknown): Promise<void>
  }
  lifecycle: {
    getWorkspace(threadId: string): Promise<LifecycleWorkspaceState>
    approveChange(threadId: string): Promise<ApproveChangeOutput>
    retryAction(threadId: string, target: PlannedAction['target']): Promise<ApproveChangeOutput>
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

export function parseReasoningResult(value: unknown): ReasoningResult {
  return reasoningResultSchema.parse(value)
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('Provider did not return a JSON object')
  return JSON.parse(candidate)
}
