import { z } from 'zod'
import type { FigmaSetupStatus } from './figma-setup'
import type { ApproveChangeOutput, CanvasCommandOutput, CanvasGestureCommand, ChangePreview, LifecycleWorkspaceState, PlannedAction } from './lifecycle'
import type { ProductSpec } from './product-spec'
import type { ArtifactProgressEvent } from './execution'
import type { MockJiraPlan, MockZdocPlan } from './mock-artifact'
import { canvasProgramJsonSchema, canvasProgramSchema, emptyCanvasProgram, normalizeCanvasProgram, type CanvasDiffContext, type CanvasDocumentContext, type CanvasExecutionFailure, type CanvasExecutionReceipt, type CanvasProgram, type CanvasPromotionPreview } from './canvas-program'
import { figmaCreativeBlueprintJsonSchema, figmaCreativeBlueprintSchema } from './figma-creative'

export * from './design-system'
export * from './artifact-brief'
export * from './artifact-plan'
export * from './figma-integration'
export * from './figma-setup'
export * from './execution'
export * from './invariants'
export * from './lifecycle'
export * from './mock-artifact'
export * from './product-spec'
export * from './state-machine'
export * from './canvas-program'
export * from './figma-creative'
export * from './figma-craft-audit'

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
  z.object({
    type: z.literal('create_canvas_node'),
    nodeId: z.string().min(1),
    label: z.string().min(1),
    nodeKind: z.enum(['note', 'process', 'decision', 'screen']),
  }),
  z.object({
    type: z.literal('connect_canvas_nodes'),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    label: z.string().min(1).optional(),
  }),
])
export type ProviderCommand = z.infer<typeof providerCommandSchema>

export const reasoningResultSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  message: z.string().min(1),
  commands: z.array(providerCommandSchema).default([]),
})
export type ReasoningResult = z.infer<typeof reasoningResultSchema>

export const providerIntentKinds = ['conversation', 'discovery', 'draw', 'edit', 'promote', 'change', 'artifact'] as const
export const providerArtifactActions = ['prepare', 'approve', 'status', 'retry'] as const

export const providerIntentSchema = z.object({
  kind: z.enum(providerIntentKinds),
  target: z.string().min(1).max(200).nullable(),
  artifactAction: z.enum(providerArtifactActions).nullable(),
}).default({ kind: 'conversation', target: null, artifactAction: null })
export type ProviderIntent = z.infer<typeof providerIntentSchema>

export const conversationSuggestionKinds = ['explore', 'visualize', 'refine', 'commit', 'artifact'] as const
export const conversationSuggestionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(48),
  prompt: z.string().min(1).max(320),
  kind: z.enum(conversationSuggestionKinds),
})
export type ConversationSuggestion = z.infer<typeof conversationSuggestionSchema>

export const conversationRouteResultSchema = z.object({
  schemaVersion: z.literal(1),
  message: z.string().min(1),
  intent: providerIntentSchema,
  suggestions: z.array(conversationSuggestionSchema).max(3),
})
export type ConversationRouteResult = z.infer<typeof conversationRouteResultSchema>

const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(3),
})

const phaseResultBase = {
  schemaVersion: z.literal(1),
  message: z.string().min(1),
  commands: z.array(providerCommandSchema),
  intent: providerIntentSchema,
  canvasProgram: canvasProgramSchema.optional(),
  figmaBlueprint: figmaCreativeBlueprintSchema.optional(),
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
  shapeIds?: string[]
  selectedShapeCount?: number
  contextItems?: Array<{
    shapeId: string
    entityId?: string
    type: string
    label: string
  }>
}

export interface ThreadSummary {
  id: string
  title: string
  phase: WorkflowView
  collaborationMode?: 'studio' | 'lifecycle'
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
  modelOptions?: Array<{ id: string; label: string; detail?: string }>
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
  canvas?: CanvasDocumentContext
  canvasDiff?: CanvasDiffContext
}

export interface SendChatOutput {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  commands: ProviderCommand[]
  suggestions: ConversationSuggestion[]
  canvasProgram: CanvasProgram
  canvasProgramSource: 'provider' | 'provider_augmented' | 'deterministic_fallback' | 'none'
  canvasRequestId: string | null
  changePreview?: ChangePreview
}

export interface ExternalCanvasCommandBatch {
  threadId: string
  batchId: number
  commands: ProviderCommand[]
}

export interface ExternalCanvasProgramBatch {
  threadId: string
  batchId: number
  requestId?: string
  program: CanvasProgram
  source: CanvasExecutionReceipt['source']
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

export interface ThreadExportResult {
  directoryPath: string
  files: string[]
  exportedAt: string
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
    rename(threadId: string, title: string): Promise<ThreadDetail>
    setProvider(threadId: string, profileId: string, confirmPaid?: boolean): Promise<ThreadDetail>
    messages(threadId: string, cursor?: string, limit?: number): Promise<MessagePage>
    exportBundle(threadId: string): Promise<ThreadExportResult>
  }
  canvas: {
    save(threadId: string, snapshot: unknown): Promise<void>
    recordExecution(receipt: CanvasExecutionReceipt): Promise<ChatMessage | null>
    recordFailure(failure: CanvasExecutionFailure): Promise<ChatMessage | null>
    proposeCommand(threadId: string, command: CanvasGestureCommand): Promise<CanvasCommandOutput>
    onExternalCommands(listener: (batch: ExternalCanvasCommandBatch) => void): () => void
    onExternalProgram(listener: (batch: ExternalCanvasProgramBatch) => void): () => void
  }
  lifecycle: {
    getWorkspace(threadId: string): Promise<LifecycleWorkspaceState>
    approveChange(threadId: string): Promise<ApproveChangeOutput>
    rejectChange(threadId: string): Promise<ApproveChangeOutput>
    retryAction(threadId: string, target: PlannedAction['target']): Promise<ApproveChangeOutput>
    advanceDecision(threadId: string, answers: Record<string, string>): Promise<LifecycleWorkspaceState>
    selectDecision(threadId: string, optionId: string, customTitle?: string): Promise<LifecycleWorkspaceState>
    previewPromotion(threadId: string, canvas: CanvasDocumentContext): Promise<CanvasPromotionPreview>
    commitPromotion(threadId: string, payloadHash: string): Promise<LifecycleWorkspaceState>
    confirmProductSpec(threadId: string): Promise<LifecycleWorkspaceState>
    prepareArtifacts(threadId: string): Promise<LifecycleWorkspaceState>
    regenerateArtifacts(threadId: string, feedback?: string): Promise<LifecycleWorkspaceState>
    approveArtifacts(threadId: string): Promise<ApproveChangeOutput>
    rejectArtifacts(threadId: string): Promise<ApproveChangeOutput>
    getBacklog(threadId: string): Promise<MockJiraPlan>
    getZdoc(threadId: string): Promise<MockZdocPlan>
    showDocument(threadId: string): Promise<void>
    showBacklog(threadId: string): Promise<void>
    showZdoc(threadId: string): Promise<void>
    onArtifactProgress(listener: (event: ArtifactProgressEvent) => void): () => void
  }
  figma: {
    status(): Promise<FigmaSetupStatus>
    start(): Promise<FigmaSetupStatus>
    allowTarget(sessionId: string, useDesignSystem?: boolean): Promise<FigmaSetupStatus>
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
  devBridge: {
    status(): Promise<DevBridgeStatus>
  }
  menu: {
    onOpenSettings(listener: () => void): () => void
  }
}

export interface DevBridgeStatus {
  schemaVersion: 1
  running: boolean
  port: number | null
  skill: {
    installed: boolean
    id: string
    version: string
    dir: string
    status: string
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
        required: ['type', 'label', 'query', 'view', 'nodeId', 'nodeKind', 'fromId', 'toId'],
        properties: {
          type: { type: 'string', enum: ['add_card', 'remove_card', 'focus_card', 'switch_view', 'create_canvas_node', 'connect_canvas_nodes'] },
          label: { type: ['string', 'null'] },
          query: { type: ['string', 'null'] },
          view: { type: ['string', 'null'], enum: [...workflowViews, null] },
          nodeId: { type: ['string', 'null'] },
          nodeKind: { type: ['string', 'null'], enum: ['note', 'process', 'decision', 'screen', null] },
          fromId: { type: ['string', 'null'] },
          toId: { type: ['string', 'null'] },
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

const providerIntentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'target', 'artifactAction'],
  properties: {
    kind: { type: 'string', enum: providerIntentKinds },
    target: { type: ['string', 'null'] },
    artifactAction: { type: ['string', 'null'], enum: [...providerArtifactActions, null] },
  },
} as const

export const conversationRouteJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'message', 'intent', 'suggestions'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    message: { type: 'string' },
    intent: providerIntentJsonSchema,
    suggestions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'prompt', 'kind'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          prompt: { type: 'string' },
          kind: { type: 'string', enum: conversationSuggestionKinds },
        },
      },
    },
  },
} as const

export function reasoningJsonSchemaForPhase(
  phase: WorkflowView,
  options: { includeCanvasProgram?: boolean; includeFigmaBlueprint?: boolean; intentKind?: ProviderIntent['kind'] } = {},
): Record<string, unknown> {
  const includeCanvasProgram = options.includeCanvasProgram ?? true
  const includeFigmaBlueprint = options.includeFigmaBlueprint ?? false
  const intentSchema = options.intentKind
    ? {
        ...providerIntentJsonSchema,
        properties: {
          ...providerIntentJsonSchema.properties,
          kind: { type: 'string', const: options.intentKind },
        },
      }
    : providerIntentJsonSchema
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'phase',
      'message',
      'commands',
      'intent',
      ...(includeCanvasProgram ? ['canvasProgram'] : []),
      ...(includeFigmaBlueprint ? ['figmaBlueprint'] : []),
      'phaseData',
    ],
    properties: {
      schemaVersion: { type: 'integer', const: 1 },
      phase: { type: 'string', const: phase },
      message: { type: 'string' },
      commands: commandJsonSchema,
      intent: intentSchema,
      ...(includeCanvasProgram ? { canvasProgram: canvasProgramJsonSchema } : {}),
      ...(includeFigmaBlueprint ? { figmaBlueprint: figmaCreativeBlueprintJsonSchema } : {}),
      phaseData: phaseDataJsonSchemas[phase],
    },
  }
}

export function parseReasoningResult(value: unknown): ReasoningResult {
  return reasoningResultSchema.parse(value)
}

export function parseConversationRouteResult(value: unknown): ConversationRouteResult {
  return conversationRouteResultSchema.parse(value)
}

export function parsePhaseReasoningResult(value: unknown, expectedPhase: WorkflowView): PhaseReasoningResult {
  const schemas = {
    discover: discoveryReasoningResultSchema,
    decide: decisionReasoningResultSchema,
    deliver: deliveryReasoningResultSchema,
    change: changeReasoningResultSchema,
  } as const
  return schemas[expectedPhase].parse(normalizeProviderCommandEnvelope(value, expectedPhase)) as PhaseReasoningResult
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeProviderCommandEnvelope(value: unknown, expectedPhase: WorkflowView): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.commands)) return value
  const commands: unknown[] = []

  for (const raw of result.commands) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const command = raw as Record<string, unknown>
    const label = nonEmptyString(command.label)
    const query = nonEmptyString(command.query)
    const view = workflowViews.find((item) => item === command.view)
    if (command.type === 'add_card' && label) {
      commands.push({ type: 'add_card', label, view: view ?? expectedPhase })
    } else if (command.type === 'remove_card' && query) {
      commands.push({ type: 'remove_card', query })
    } else if (command.type === 'focus_card' && query) {
      commands.push({ type: 'focus_card', query })
    } else if (command.type === 'switch_view' && view) {
      commands.push({ type: 'switch_view', view })
    } else if (command.type === 'create_canvas_node' && label) {
      const nodeId = nonEmptyString(command.nodeId) ?? `node-${commands.length + 1}`
      const nodeKind = ['note', 'process', 'decision', 'screen'].find((item) => item === command.nodeKind)
      commands.push({ type: 'create_canvas_node', nodeId, label, nodeKind: (nodeKind ?? 'process') as 'note' | 'process' | 'decision' | 'screen' })
    } else if (command.type === 'connect_canvas_nodes') {
      const fromId = nonEmptyString(command.fromId)
      const toId = nonEmptyString(command.toId)
      if (fromId && toId && fromId !== toId) {
        commands.push({ type: 'connect_canvas_nodes', fromId, toId, ...(label ? { label } : {}) })
      }
    } else if (!['add_card', 'remove_card', 'focus_card', 'switch_view', 'create_canvas_node', 'connect_canvas_nodes'].includes(String(command.type))) {
      commands.push(raw)
    }
  }

  return { ...result, commands, canvasProgram: normalizeCanvasProgram(result.canvasProgram) ?? emptyCanvasProgram }
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('Provider did not return a JSON object')
  return JSON.parse(candidate)
}
