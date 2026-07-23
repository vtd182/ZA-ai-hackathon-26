# UI, History, Canvas and Performance

## 1. Interaction model

The app is a work surface, not a landing page:

```text
┌──────────────┬──────────────────────────────────┬─────────────────────┐
│ History      │ Active free canvas               │ Chat / Inspector    │
│ search       │ infinite tldraw surface          │ messages            │
│ recent runs  │ workflows · sketches · feedback │ approvals           │
│ archived     │                                  │ entity detail       │
├──────────────┴──────────────────────────────────┴─────────────────────┤
│ provider · phase · connector health · save/sync/verification status  │
└──────────────────────────────────────────────────────────────────────┘
```

The center is one unconstrained infinite tldraw canvas. There is no Board/Discover/Decide/Deliver/Change tab bar; lifecycle appears as compact thread status and audit timeline only.

Responsive behavior:

- Wide desktop: three panels.
- Narrow desktop: history collapses first; inspector/chat share tabs.
- No mobile target for MVP, but controls must not overlap at minimum supported window.

## 2. Ownership model

Interpretation of “mỗi log chat là một canvas riêng”:

```text
Project
  -> ConversationThread (history item)
       -> exactly one CanvasDocument
       -> many Turns
            -> many Messages / AgentEvents
            -> optional CanvasCheckpoint
       -> many ProductSpecVersions
       -> many ProviderSegments
```

Opening an old history item restores its latest canvas checkpoint, committed ProductSpec, workflow state and provider segment summary. Continuing creates a new turn in the same thread/canvas. A new thread always opens a truly empty canvas.

P1 branching creates a new thread and canvas cloned from a selected checkpoint; it never rewrites the original history.

## 3. Persistence entities

P0 tables added to the architecture baseline:

- `projects`
- `conversation_threads`
- `turns`
- `messages`
- `message_parts`
- `provider_segments`
- `provider_events`
- `canvas_documents`
- `canvas_snapshots`
- `canvas_patches`
- `thread_checkpoints`
- `thread_search` using SQLite FTS5

Important fields:

```ts
interface ConversationThread {
  id: string;
  projectId: string;
  title: string;
  status: "active" | "completed" | "archived" | "failed";
  currentPhase: WorkflowPhase;
  activeProviderSegmentId?: string;
  canvasDocumentId: string;
  latestCheckpointId?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}
```

Messages store normalized user-visible content. Provider events store bounded normalized execution telemetry. Do not put an entire raw provider response or tldraw store into a message row.

## 4. Resume flow

```text
Select thread in History
  -> load thread summary + latest checkpoint
  -> validate schema/migrate if needed
  -> hydrate ProductSpec and RunState
  -> load latest canvas snapshot
  -> replay canvas patches after snapshot
  -> render shell immediately, hydrate detail progressively
  -> probe last provider in background
  -> allow local inspection even when provider/connectors are offline
  -> on next message, resume native segment or open a new segment from handoff
```

A thread is still resumable when its previous provider is unavailable. Provider-native thread IDs improve continuity but do not own it.

## 5. Chat controls canvas

### Chat to canvas

User input such as “vẽ workflow onboarding gồm đăng ký, xác thực và hoàn tất” follows:

```text
message
  -> app-owned conversation/draw/edit/promote intent
  -> bounded selection/region/canvas context when allowed
  -> CanvasProgram proposal
  -> validation + deterministic explicit-draw fallback
  -> apply/runScript as one undoable canvas transaction
  -> durable canvas checkpoint + normalized read-back
  -> request/receipt verification + concise final chat outcome
```

Supported P0 canvas tools:

- inspect full canvas, selection or bounded region;
- create/update/delete shapes and semantic nodes;
- bind/connect nodes and arrange a workflow or prototype map;
- run the bounded JavaScript-call subset (`canvas.node/connect/update/remove`) in an isolated virtual-API worker;
- read back normalized shapes, bounds and connections;
- checkpoint and undo the whole agent update.

The provider is not asked to choose a lifecycle view. Lifecycle reasoning may suggest a next business action in chat, but it cannot constrain what the canvas may contain.
Ordinary product chat remains non-mutating. A vague canvas edit without a selection or named target asks for clarification. A pending canvas message is replaced by an exact outcome only after apply, durable save and read-back succeed.

### Canvas to chat/domain

Canvas gestures emit semantic commands:

- selecting shapes or drawing an enclosing annotation sets bounded `CanvasContext` for the next message;
- manual edits are immediately visible to the next inspect/read-back call;
- “chốt flow này” creates a ProductSpec promotion preview and asks for confirmation;
- confirmed ProductSpec shapes use guarded business commands when changed through the inspector;
- viewport-only pan/zoom remains presentation state and does not enter ProductSpec.

Follow-up: evaluate an explicit `Sync selection/region with chat` control and a dirty-canvas indicator. It should snapshot the chosen context for the next turn without making manual drawing dependent on an AI call.

The chat transcript records concise domain outcomes, approvals and failures. High-frequency pointer events are never logged as chat messages.

## 6. Undo and checkpoints

- Presentation undo/redo is local to tldraw; one agent CanvasProgram is one undo boundary.
- Business undo is implemented as a new inverse domain command/ProductSpec version.
- Save a thread checkpoint at stage boundaries, decisions, approvals, verified actions and app close.
- Canvas snapshot every stage boundary or after a patch threshold; compact old patches asynchronously.
- Never overwrite a verified receipt or historical ProductSpec version.

## 7. Loading strategy

- History query returns lightweight rows only: title, phase, provider, updated time, status and summary.
- Paginate messages newest-first and load older pages on demand.
- Virtualize history and chat lists.
- Hydrate only the active CanvasDocument; serialize/unmount inactive canvases.
- Load inspector details by selected entity ID.
- Fetch evidence bodies and artifact snapshots lazily.
- Keep renderer state normalized by IDs to avoid large object churn.

## 8. Stream and render performance

- Provider adapters normalize events off the React render path.
- Batch token/message deltas at approximately one animation frame or 30-50 ms.
- Do not persist every token; flush message chunks on interval and terminal events.
- Keep streaming text state separate from committed message state.
- Memoize normalized canvas inspection by snapshot revision and selection bounds.
- Compute deterministic layout/impact in a worker when entity count crosses a threshold.
- Apply canvas patches in batches; do not reconstruct the entire tldraw store for one highlight.
- IPC payloads are typed, paginated and bounded.

## 9. SQLite performance

- Use WAL mode and short transactions.
- Index `conversation_threads(project_id, updated_at)`, `messages(thread_id, created_at)`, `turns(thread_id, sequence)`, `provider_events(segment_id, sequence)` and artifact idempotency keys.
- Keep large snapshots compressed/blob-backed and outside hot list queries.
- Use FTS5 for title/message/decision search with redacted normalized text.
- Run migrations and heavy compaction before/after interactive work, not on pointer/chat hot paths.
- Repository calls execute in main/local worker, never renderer.

## 10. Performance budgets

Budgets are targets to instrument, not claims before measurement:

| Operation | Target |
| --- | --- |
| Warm app shell visible | <= 1.5 s on demo machine |
| History page query (50 items) | <= 100 ms local p95 |
| Resume thread (500 messages, 500 shapes) to interactive | <= 1.0 s local p95 |
| Canvas pan/zoom/selection | >= 55 FPS at 500 visible shapes |
| Provider event to visible streamed delta | <= 100 ms app overhead p95 |
| Domain command to updated canvas projection | <= 150 ms at 500 entities |
| Renderer long task | no task > 50 ms in normal demo path |

Add telemetry around these boundaries and record actual demo-machine measurements before final packaging.

## 11. UX states required

- empty history;
- thread loading/migration;
- provider connecting/streaming/cancelled/unavailable;
- offline local resume;
- canvas hydrating/failed projection;
- pending approval/executing/verifying/partial failure;
- stale provider segment after resume;
- unsaved local canvas presentation changes;
- archived/completed thread.

## 12. E2E scenarios

1. Create thread A, interact with its canvas, then create thread B; canvases remain isolated.
2. Restart app and resume thread A at its latest checkpoint.
3. Continue thread A using a different provider; messages and canvas remain continuous.
4. Select a requirement on canvas and ask chat to remove it; selection context scopes the proposal.
5. Drag a requirement to removed scope; change preview appears before business mutation.
6. Explicitly promote selected flow, inspect ProductSpec preview, confirm it, then continue through guarded Figma planning.
7. Load 500-message history and 500-shape fixture without blocking renderer.
