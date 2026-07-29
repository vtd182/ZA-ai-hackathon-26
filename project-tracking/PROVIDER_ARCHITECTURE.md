# Provider Architecture

## 1. Goal

Support these provider families without coupling ProductSpec, history or workflow state to any one API:

- Codex App Server using the user's supported local Codex authentication.
- OpenAI Responses API using an OpenAI API key.
- Gemini Interactions API using a Gemini API key.
- Anthropic Messages API using an Anthropic API key.
- Deterministic mock provider for tests and offline demo.

Provider switching means continuing the same app-owned conversation from a canonical checkpoint. It does not mean transferring hidden reasoning or replaying one provider's opaque wire format into another.

## 2. What official APIs imply

| Provider | Native conversation model | Streaming/structured behavior | Architecture consequence |
| --- | --- | --- | --- |
| Codex App Server | Thread -> Turn -> Item; supports start/resume/fork and streamed notifications | Rich client protocol includes history, approvals and agent events | Use a version-pinned generated schema and adapter; do not make Codex thread the app source of truth |
| OpenAI Responses | Optional provider-managed Conversation or `previous_response_id` chain | Streamed response/tool events and JSON schema outputs | Remote state is optional optimization; local history/checkpoint remains canonical |
| Gemini Interactions | Optional `previous_interaction_id`; `store` can be disabled | Structured output and function-call deltas; stateful mode manages thought signatures | Prefer native Interactions adapter; preserve opaque interaction IDs/signatures inside adapter metadata |
| Anthropic Messages | Stateless multi-turn: client sends history | SSE content blocks/tool input deltas and strict structured/tool output | Context assembler owns history window; preserve required signed blocks inside adapter state during an active segment |

Do not build the core on an OpenAI-compatible endpoint. Gemini documents that compatibility is useful for low-friction basic integration but does not map all provider-native features one-to-one.

## 3. Canonical interfaces

```ts
export interface ReasoningProviderAdapter {
  readonly providerId: string;

  probe(config: ProviderConfigRef): Promise<ProviderProbe>;
  openSegment(input: OpenSegmentInput): Promise<ProviderSession>;
  stream(
    session: ProviderSession,
    request: CanonicalReasoningRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
  submitToolResults?(
    session: ProviderSession,
    results: CanonicalToolResult[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
  cancel(session: ProviderSession): Promise<void>;
  close(session: ProviderSession): Promise<void>;
}
```

Provider adapters may expose native helpers internally, but Agent Core sees only this contract.

```ts
export interface ProviderCapabilities {
  streaming: boolean;
  structuredOutput: "native" | "tool_schema" | "prompt_json" | "none";
  toolCalling: "parallel" | "sequential" | "none";
  persistentRemoteState: boolean;
  cancellation: boolean;
  tokenUsage: boolean;
  promptCaching: "automatic" | "explicit" | "none";
  maxContextTokens?: number;
  maxOutputTokens?: number;
}
```

Capabilities come from probe/configuration and are persisted as a snapshot on each segment. Core behavior must not switch on a provider/model string.

## 4. Canonical request and events

```ts
export interface CanonicalReasoningRequest {
  requestId: string;
  threadId: string;
  turnId: string;
  phase: WorkflowPhase;
  goal: string;
  systemPolicyVersion: string;
  checkpoint: HandoffPackage;
  recentMessages: CanonicalMessage[];
  availableActions: AvailableAction[];
  outputSchema: JsonSchema;
  budget: ReasoningBudget;
}
```

Normalized stream event union:

```text
segment_started
message_delta
rationale_summary_delta
structured_output_delta
tool_call_started
tool_call_delta
tool_call_completed
usage_updated
provider_warning
response_completed
response_failed
```

Raw provider events may be stored in an encrypted/debug-only bounded trace when needed, but UI and domain reducers consume normalized events only. Hidden reasoning is never stored or displayed.

## 5. Provider segments

One app conversation can contain multiple provider segments:

```ts
interface ProviderSegment {
  id: string;
  threadId: string;
  providerId: string;
  modelId: string;
  capabilities: ProviderCapabilities;
  remoteSessionRef?: EncryptedOpaqueRef;
  startCheckpointId: string;
  endCheckpointId?: string;
  status: "active" | "completed" | "interrupted" | "failed";
  startedAt: string;
  endedAt?: string;
}
```

The opaque reference can contain a Codex thread ID, OpenAI conversation/response ID or Gemini interaction ID. Anthropic may have no remote conversation ID. No domain code reads its shape.

## 6. Safe switching algorithm

```text
User requests provider change
  -> ensure no reasoning stream or connector write is in flight
  -> finish/cancel current turn
  -> persist messages, ProductSpec, canvas checkpoint and action receipts
  -> create HandoffPackage + summary hash
  -> close current ProviderSegment
  -> probe selected provider/model/cost mode
  -> show capability/privacy/cost differences
  -> user confirms when credentials or paid API are involved
  -> open new ProviderSegment from HandoffPackage
  -> continue same app thread and canvas
```

Switching is blocked during:

- uncommitted ProductSpec mutation;
- approved action not yet persisted to outbox;
- connector write without receipt;
- Figma mutation in progress;
- incomplete streamed tool-call arguments.

## 7. Handoff package

```ts
interface HandoffPackage {
  schemaVersion: number;
  threadId: string;
  goal: string;
  workflowPhase: WorkflowPhase;
  checkpointSummary: string;
  productSpec: ProductSpec;
  latestDecisionIds: string[];
  findingIds: string[];
  openQuestions: OpenQuestion[];
  artifactMappings: ArtifactMapping[];
  pendingActions: PlannedAction[];
  recentMessageWindow: CanonicalMessage[];
  canvasSelectionContext?: CanvasSelectionContext;
  integrityHash: string;
}
```

Large evidence and old messages are referenced by ID and fetched only when needed. The handoff package is bounded, versioned and provider-neutral.

## 8. Context assembly and compaction

- Store full app history locally.
- Send system policy + canonical checkpoint + recent turn window + only relevant evidence.
- Create an app-owned summary at stage boundaries and when token budget crosses a threshold.
- Treat provider-side conversation state and prompt caching as performance optimizations.
- Persist token/usage metadata per segment to support cost visibility.
- Never copy hidden thinking between providers.
- Provider-specific signed thought/tool blocks remain opaque and valid only inside their segment.

For local-first/privacy-sensitive mode, prefer stateless requests or disable provider storage where supported. If remote state is enabled, show its retention mode in Runtime Setup.

## 9. Adapter-specific rules

### Codex App Server adapter

- Prefer `codex app-server` for rich embedded history/streaming integration; `codex mcp-server` is not the primary adapter.
- Use stdio for MVP. WebSocket support is experimental and should remain optional.
- Run initialization handshake once per process.
- Generate TypeScript/JSON schemas from the installed Codex version and pin the supported version range.
- Map thread/turn/item notifications to canonical events.
- Resume native thread only within the same segment; app resume still works from local checkpoint if Codex thread is unavailable.
- Do not expose Figma/Jira/Zdoc write tools directly to Codex.

### OpenAI Responses adapter

- Use the native Responses API and structured outputs/function tools.
- Support stream cancellation and normalized usage.
- Provider-managed conversation state is opt-in; `store`/retention behavior must be visible.
- Do not rely on `previous_response_id` for app history restore or cross-provider handoff.

### Gemini Interactions adapter

- Use the native Google Gen AI SDK/Interactions API, not OpenAI compatibility, for full semantics.
- Preserve `previous_interaction_id` only as opaque segment metadata.
- Stateful mode handles thought signatures; stateless mode requires exact round-trip of opaque thought blocks.
- Re-send interaction-scoped tools/system/generation configuration on each turn.
- Validate final structured values against domain invariants after JSON schema validation.

### Anthropic Messages adapter

- Build each request from app-owned history because Messages is stateless.
- Preserve content block ordering and tool-use/tool-result IDs.
- Buffer partial tool JSON until complete unless a specific tool safely supports eager streaming.
- Use strict tool/structured output where available, then run domain validation.
- Use prompt cache breakpoints for stable tool/system prefixes, without making cache state a correctness dependency.

### AgentRouter gateway profile

- The shipped `agentrouter` profile uses the China AgentRouter docs endpoint `https://agentrouter.org/v1`.
- UI exposes the account's three allowed models: `gpt-5.6-sol`, `claude-opus-4-8` and `claude-opus-5`.
- Direct generic OpenAI/Anthropic SDK calls are not a working integration path in live tests; AgentRouter returned `unauthorized client detected`.
- The working path verified on 2026-07-29 is Codex CLI/Responses bridge with `wire_api = "responses"` and `AGENT_ROUTER_TOKEN`, which returned `OK` for `gpt-5.6-sol`.
- `claude-opus-4-8` and `claude-opus-5` are selectable but returned repeated reconnect/high-demand errors through the Codex/Responses bridge in the same test session. Keep the UX honest and surface provider errors instead of silently falling back to another model.
- `AGENTROUTER_BASE_URL` may override the endpoint only when it still resolves to an AgentRouter `/v1` base URL.

## 10. Configuration and credentials

```ts
interface ProviderProfile {
  id: string;
  providerId: string;
  displayName: string;
  modelId: string;
  credentialRef?: KeychainRef;
  endpoint?: string;
  remoteStatePolicy: "disabled" | "provider_default" | "enabled";
  costMode: "subscription" | "api_paid" | "mock";
  enabled: boolean;
}
```

- Model IDs are editable configuration discovered/validated by adapters.
- Credentials live in Keychain or supported local runtime stores.
- Provider profile changes do not rewrite historical segment metadata.
- No automatic switch from subscription/mock to paid API.

## 11. Conformance tests

Every adapter must pass:

1. Availability returns typed status without leaking SDK errors.
2. A schema-valid fixture maps to the same canonical ReasoningResult.
3. Malformed/partial stream cannot mutate canonical state.
4. Cancel reaches a terminal normalized event.
5. Tool call becomes a ProposedAction and never executes directly.
6. Resume in the same segment works or degrades to canonical handoff.
7. Switching out creates a complete HandoffPackage.
8. Usage and provider/model metadata are persisted.
9. Credential and hidden reasoning are absent from logs/SQLite.

## 12. Official references reviewed

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [OpenAI Responses and conversation state](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI Conversations API](https://platform.openai.com/docs/api-reference/conversations)
- [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini OpenAI compatibility trade-offs](https://ai.google.dev/gemini-api/docs/partner-integration)
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [AgentRouter Pi integration guide](https://docs.agentrouter.org/pi.html)
- [AgentRouter Codex integration guide](https://docs.agentrouter.org/codex.html)
- [AgentRouter Claude Code integration guide](https://docs.agentrouter.org/claude-code.html)
