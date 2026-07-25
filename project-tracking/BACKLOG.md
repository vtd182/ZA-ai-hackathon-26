# Implementation Backlog

## Cách vận hành

- Chỉ một task có status `IN_PROGRESS` trong cùng workstream.
- Task ID được dùng trong branch/commit/PR/test evidence khi repo đã có Git.
- Ưu tiên theo thứ tự `P0`, `P1`, `P2`; dependency chưa xong thì không kéo task sau vào làm.
- Khi hoàn thành, thêm evidence ngắn ngay tại dòng task hoặc trong session log của `PROJECT_MEMORY.md`.

## Epic E0 - Repository foundation

### `P0-FND-001` Bootstrap workspace

- **Status:** DONE (2026-07-22)
- **Depends on:** none
- **Deliver:** pnpm workspace, Electron Vite + React + TypeScript strict, shared tsconfig, Vitest.
- **Acceptance:** `pnpm dev`, `pnpm test`, `pnpm typecheck` chạy; renderer không có Node integration.
- **Current slice:** Electron shell + typed IPC + SQLite history + provider registry + one tldraw canvas per thread + `run.sh`.
- **Evidence:** `./run.sh typecheck`, `./run.sh test`, `./run.sh build`, Mock smoke và Codex App Server smoke đều pass; production screenshot xác nhận history/chat/tldraw render.

### `P0-FND-002` Package boundaries and lint rules

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FND-001
- **Deliver:** packages `domain`, `agent-core`, `reasoning`, `connectors`, `canvas`, `persistence`, `shared`.
- **Acceptance:** import boundaries được document/enforce; `domain` test được không cần Electron/DOM.
- **Evidence:** `scripts/check-boundaries.mjs` chạy trong `./run.sh typecheck`; 10 workspace projects typecheck độc lập.

### `P0-FND-003` Synthetic demo fixtures

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FND-001
- **Deliver:** meal-ordering idea, discovery sources, 3 questions/options, mock Jira/Zdoc data, design-system fixture.
- **Acceptance:** fixture deterministic, versioned, không có production URL/PII/secret; có script reset.
- **Evidence:** versioned meal-ordering + synthetic Zalo-like DS fixtures parse tại module boundary; deterministic thread/message IDs and timestamps seed SQLite. `./run.sh reset` và UI reset preserve provider/Figma setup while replacing history/canvas/run/outbox/mock artifacts. Unit test plus `./run.sh smoke-reset` prove three resets produce identical state before a fully verified flow.

## Epic E1 - Domain and workflow

### `P0-DOM-001` Versioned domain schemas

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FND-002
- **Deliver:** Zod schemas cho ProductSpec, RunState, ProductIdea, findings, decisions, actions, receipts, mappings.
- **Acceptance:** valid fixture parses; invalid reference/duplicate ID/unsupported version bị reject với typed error.
- **Evidence:** `packages/domain/src/product-spec.test.ts` và fixture test pass trong `./run.sh test` (10 tests total).

### `P0-DOM-002` Workflow state machine

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-001
- **Deliver:** lifecycle/change states, transition table, guards, domain events.
- **Acceptance:** test mọi happy transition và ít nhất 5 invalid transitions; write state không thể tới trước approval.
- **Evidence:** full lifecycle và 5 invalid transitions pass trong `packages/agent-core/src/impact.test.ts`.

### `P0-DOM-003` ProductSpec invariant validator

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-001
- **Deliver:** unique IDs, valid refs, AC ownership, traceability, artifact mapping constraints.
- **Acceptance:** dangling relationship và unmapped must-have requirement được báo cụ thể.
- **Evidence:** schema reject dangling refs; invariant test báo `UNMAPPED_MUST_HAVE` theo entity ID.

### `P0-DOM-004` Deterministic impact graph

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-003
- **Deliver:** graph index, traversal, impact set, before/after diff.
- **Acceptance:** remove-payment fixture chỉ trả đúng payment requirement/screen/story/dependency và affected edges.
- **Evidence:** exact five-entity impact set, valid spec v2 và 3 target plans được regression-test.

## Epic E2 - Agent orchestration

### `P0-AGT-001` Reasoning provider contract and mock

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-001, P0-FND-003
- **Deliver:** provider interface, phase-specific schemas, deterministic MockReasoningProvider.
- **Acceptance:** cùng input/version cho cùng output; malformed output không mutate RunState.
- **Evidence:** four versioned phase schemas cover discover questions, decision options/recommendation, delivery targets and structured change ambiguity. Mock output is deterministic per phase; all native adapters receive phase-specific strict JSON schemas. Agent Core rejects malformed/wrong-phase proposals without mutating RunState. 61 tests, Mock smoke and real Codex App Server smoke pass.

### `P0-AGT-002` Core orchestration loop

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-AGT-001, P0-DOM-002
- **Deliver:** build request, validate result, apply domain commands, completion/error conditions.
- **Acceptance:** fixture chạy Idea -> WAITING_FOR_DECISION và resume từ checkpoint.
- **Evidence:** Agent Core validates phase output before transitions, advances Idea -> Discovery -> Decision, validates selected option and emits versioned reasoning checkpoints. SQLite persists checkpoints atomically with RunState; reopen test restores `DECISION/WAITING_FOR_DECISION` and the deterministic recommendation. Signature change flow remains independently covered by production smoke.

### `P0-AGT-003` Provider registry and normalized events

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-AGT-001
- **Deliver:** registry, capability probe, normalized stream events, cancellation và provider conformance kit.
- **Acceptance:** core/UI không import provider SDK type; malformed/partial stream không mutate canonical state.
- **Evidence:** versioned internal event union normalizes start/delta/result/usage/completed/cancelled/failed without SDK types. Core requires contiguous events, one schema-valid result and terminal completion before acceptance; partial/malformed tests preserve canonical state. Every adapter exposes explicit implemented capabilities, usage normalization exists for API adapters, Mock conformance and real Codex smoke pass. Renderer batching remains tracked under history UI rather than provider correctness.

### `P0-AGT-004` Approval policy and payload hash

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-002
- **Deliver:** preview, approve/reject, action policy, payload hash invalidation.
- **Acceptance:** action thay payload sau approval quay lại `pending_approval`; unapproved write bị chặn.
- **Evidence:** SHA-256 payload mutation test invalidates approval; SQLite atomic commit rejects missing/mismatched approval.

### `P0-AGT-005` Outbox, execution and verification orchestration

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-AGT-004, P0-PER-002
- **Deliver:** queue, claim, retry, receipt-first recovery, verification status.
- **Acceptance:** crash/retry simulation không duplicate; verification mismatch thành `VERIFICATION_FAILED`.
- **Evidence:** approval + ba outbox actions commit trong cùng SQLite transaction; receipt được persist trước read-back, restart đưa work về `verifying`, retry không gọi external execute lần hai và mismatch được lưu `verification_failed`. Unit/contract suite 56 tests và production smoke với cả ba target `verified` đều pass.

### `P0-AGT-006` Decision to ProductSpec synthesis

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-AGT-002, P0-DOM-003, P0-CAN-003
- **Deliver:** convert the selected option plus clarified idea into a validated thread-specific ProductSpec v1 with requirements, screens, stories, dependencies, decisions and traceability relationships.
- **Acceptance:** a normal empty-draft thread reaches Delivery with a non-placeholder ProductSpec derived from its own messages/decision; malformed or untraceable synthesis cannot replace the draft; canvas and Figma planner consume the committed spec without fixture data.
- **Priority note:** This closes the main non-demo path `chat -> canvas -> decision -> Figma`; the deterministic meal-ordering thread remains only a demo fixture.
- **Evidence:** deterministic domain-aware synthesis creates validated requirements, screens, stories, dependencies, decisions and relationships from the thread's idea/clarifications/selected option. SQLite replaces only an untouched empty v1 draft atomically. Unit/persistence tests and `./run.sh smoke-lifecycle` prove the synthesized spec survives canvas Sync and produces five editable prototype frames.

## Epic E3 - Persistence

### `P0-PER-001` SQLite repositories and migrations

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-001
- **Deliver:** schema/migration cho projects, threads, turns, messages, provider segments/events, canvas snapshots/patches, runs, spec versions, actions, approvals, receipts và mappings.
- **Acceptance:** migration chạy trên clean DB; repository round-trip giữ nguyên schema version.
- **Evidence:** idempotent `schema_migrations` ledger owns turns, message parts, normalized provider events, canvas documents/checkpoints/patches and persisted artifact mappings; existing stores own runs/spec/actions/approvals/outbox/receipts/verifications/Figma cache. Clean/reopen round-trip tests preserve schema version and production clean-profile smoke passes.

### `P0-PER-002` Transaction and checkpoint service

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-PER-001, P0-DOM-002
- **Deliver:** atomic domain commit, approval+outbox commit, checkpoint summary.
- **Acceptance:** injected failure không tạo half-committed ProductSpec/action; restart load đúng phase.
- **Evidence:** preview, approval/rejection, ProductSpec version, actions, approvals and outbox use SQLite transactions; duplicate approval injection proves full rollback. Restart restores RunState/reasoning/receipt verification; canonical handoff carries checkpoint summary.

## Epic E4 - Provider, history, desktop UX and canvas

### `P0-PRV-001` Provider segments and canonical handoff

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-AGT-003, P0-PER-002
- **Deliver:** ProviderSegment persistence, HandoffPackage, safe checkpoint guards và cost/privacy confirmation.
- **Acceptance:** đổi provider giữ nguyên thread/canvas/ProductSpec; switch bị chặn khi stream/write chưa ổn định; không auto-fallback sang paid API.
- **Evidence:** canonical handoff contains ProductSpec, run checkpoint, recent messages, pending actions and canvas-presence only; no hidden provider state. Segment transaction persists capability snapshot/handoff and preserves thread/canvas/ProductSpec. Core blocks active turn/write and unconfirmed paid API. Production smoke verifies paid confirmation UI/API and round-trip Mock -> OpenAI slot -> Mock without making a paid call.

### `P0-PRV-002` Codex App Server adapter

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-PRV-001
- **Deliver:** stdio lifecycle, initialize, generated versioned schema, thread/turn/item event mapper, resume/cancel.
- **Acceptance:** app chạy một reasoning segment thật hoặc typed unavailable; Codex thread ID chỉ nằm trong opaque segment metadata; không expose write connectors trực tiếp.
- **Evidence:** native stdio initialize/thread start-resume/turn events/cancel implemented; fixed versioned output schema; real `PM_AGENT_SMOKE_PROVIDER=codex-local ./run.sh smoke` pass; remote thread ID chỉ persist trong provider segment và adapter không nhận connector.

### `P0-PRV-003` Real API adapter release slot

- **Status:** TODO
- **Depends on:** P0-PRV-001
- **Deliver:** implement một trong OpenAI Responses, Gemini Interactions hoặc Anthropic Messages theo native API, được chọn dựa trên credential sẵn có.
- **Acceptance:** pass provider conformance kit; có structured output, streaming/cancel, usage và handoff sang/từ Mock.
- **Progress:** native OpenAI Responses, Gemini và Anthropic adapters đã implement structured output/cancel cơ bản; chưa chọn/live-test release slot, chưa normalize usage/stream và chưa pass conformance/handoff.

### `P0-HIS-001` Thread, turn and message repositories

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-PER-001
- **Deliver:** thread CRUD/archive, paginated messages, normalized parts/events, FTS5 search và indexes.
- **Acceptance:** 500-message fixture query theo page; app không load full transcript vào renderer.
- **Evidence:** repositories now persist turns/text parts/normalized events; cursor pages are stable by `(createdAt,id)`, capped at 100 and wired to renderer “Tải tin cũ”. FTS5 trigger sync/backfill supports transcript search. 500-message test proves two non-overlapping pages within the query budget and initial renderer hydration stays capped.

### `P0-HIS-002` Thread checkpoint and resume

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-HIS-001, P0-PER-002
- **Deliver:** checkpoint schema, migration, latest restore và stale provider handling.
- **Acceptance:** restart app phục hồi phase, ProductSpec, messages và canvas; resume vẫn xem được offline.
- **Evidence:** full close/reopen integration restores phase, ProductSpec, messages and canvas without contacting a provider. Opaque stale Codex ref remains inspectable offline and is replaced by a fresh ref on the next successful segment update; Codex adapter already starts a new thread when resume fails.

### `P0-HIS-003` History sidebar and chat stream UI

- **Status:** TODO
- **Depends on:** P0-HIS-001, P0-UI-001, P0-AGT-003
- **Deliver:** searchable/virtualized history, new/open/archive thread, paginated chat, streaming/cancel states.
- **Acceptance:** chuyển thread không trộn messages; provider/model/phase/status nhìn thấy rõ; stream delta được batch.
- **Progress:** sidebar search/new/open/archive, thread isolation, visible provider/model/phase, cancel state, cursor-paginated chat and browser layout virtualization are implemented. Remaining gap is live batched delta rendering for streaming-capable providers.

### `P0-HIS-004` One canvas per thread

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-HIS-002, P0-CAN-001
- **Deliver:** CanvasDocument ownership, snapshot/patch persistence, hydrate active/unmount inactive canvas.
- **Acceptance:** thread A/B có canvas ID/state độc lập; turn tạo checkpoint thay vì canvas mới; resume giữ stable entity refs.
- **Evidence:** explicit `canvas_documents/checkpoints/patches` schema owns one unique document per thread; renderer keys/unmounts by active thread. A/B restart test proves isolated snapshots and exactly two documents while three saves create three checkpoints, not turn-scoped canvases.

### `P0-HIS-005` Chat-canvas bidirectional commands

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-HIS-004, P0-CAN-002, P0-AGT-002
- **Deliver:** CanvasSelectionContext, chat domain commands, canvas gestures -> command preview, business/presentation undo boundary.
- **Acceptance:** chat có thể focus/remove entity; canvas delete/drag không mutate ProductSpec trước preview/approval.
- **Evidence:** chat focus/remove/switch/add and selection context share the canonical ProductSpec projection. `./run.sh smoke-canvas` performs a real tldraw drag/undo/delete sequence: drag and undo remain presentation-only, delete keeps the entity and creates a guarded impact preview, and ProductSpec stays v1 until approval.

### `P0-UI-001` Typed IPC and app shell

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FND-001
- **Deliver:** main/preload/renderer contract, navigation, status bar, error boundary.
- **Acceptance:** context isolation bật; renderer không truy cập arbitrary Node API.
- **Evidence:** lifecycle APIs đi qua typed preload; production smoke xác nhận API/canvas với sandbox + context isolation.

### `P0-UI-002` Lifecycle workspace

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-AGT-002, P0-UI-001
- **Deliver:** history + idea/chat intake, clarification, option lanes, selection, ProductSpec inspector.
- **Acceptance:** user hoàn thành decision flow; tối đa 3 câu hỏi; refresh/resume không mất thread state.
- **Evidence:** new threads run Idea intake into a persisted panel of exactly three clarification questions, then 2-3 decision options with recommendation and selectable Delivery transition. ProductSpec inspector exposes version/status/entity counts and canvas selection. `./run.sh smoke-lifecycle` drives the UI, switches away/back to prove resume and saves clarification/decision screenshots; SQLite reopen test covers process restart.

### `P0-CAN-001` Canvas shapes and deterministic layout

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-UI-001, P0-DOM-001
- **Deliver:** custom shapes, four view layouts, stable entity refs and edges.
- **Acceptance:** snapshot cùng input giống nhau; shape chỉ chứa ref/presentation metadata.
- **Evidence:** versioned `pm_entity` and `pm_traceability_edge` projection contracts carry stable semantic refs while deterministic renderer-owned layout computes coordinates. Same-input graph snapshots, edge referential integrity and coordinate exclusion are tested; production smoke screenshot verifies four-view tldraw rendering with traceability arrows and no blank canvas.

### `P0-CAN-002` ProductSpec projection and domain commands

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-CAN-001, P0-DOM-003
- **Deliver:** projection renderer, selection sync, commands for option/change.
- **Acceptance:** canvas edit không sửa business state trực tiếp; command invalid bị reject.
- **Evidence:** versioned `CanvasGestureCommand` crosses typed preload IPC and is validated again by Agent Core against canonical ProductSpec. Canonical delete is intercepted, deduplicated and staged through the same immutable preview flow as chat; invalid/non-requirement and already-removed targets are rejected by unit and production smoke tests.

### `P0-CAN-003` Open canvas collaboration and semantic diagrams

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-CAN-002, P0-AGT-003, P0-HIS-004
- **Deliver:** free canvas as the default workspace, optional lifecycle filters, semantic flow/prototype commands, multi-shape spatial chat context and a guarded Dev Canvas Bridge/skill contract.
- **Acceptance:** provider output with nullable/irrelevant view fields cannot fail a whole turn; freeform shapes remain visible in every lifecycle filter; ProductSpec reconciliation preserves user layout; provider can create and connect a semantic flow without arbitrary JavaScript; selected/encircled canvas context reaches chat in bounded normalized form.
- **Evidence:** provider wire normalization tolerates irrelevant/invalid `view` fields while still rejecting unknown commands; `Board` shows only persisted freeform content while lifecycle filters reveal managed projections without hiding freeform shapes. ProductSpec reconciliation preserves user positions and relationship arrows use real tldraw bindings. Mock/Codex-compatible semantic node/connection commands render a workflow, multi-shape/spatial selection is bounded into chat context, and the token-authenticated loopback bridge plus `skills/pm-lifecycle-canvas` expose the same safe command contract to developer agents. `./run.sh smoke-flow` verifies 3 nodes, at least 2 connections, Board mode and persisted snapshot; visual review shows a clean flow and `0 Req / 0 Screen / 0 Story` for a non-demo thread.

### `P0-CAN-005` Tldraw-first canvas agent runtime

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-CAN-003, P0-AGT-003, P0-HIS-004
- **Deliver:** one unconstrained infinite tldraw surface, normalized inspect/apply/read-back tools, bounded script runtime, selection/region feedback, explicit canvas-to-ProductSpec promotion and developer bridge parity.
- **Acceptance:** a blank thread has no lifecycle projection or starter components; the onboarding prompt deterministically renders its requested nodes and edges with both Mock and real Codex response validation; one agent canvas update is one undoable transaction with read-back evidence; canvas presentation never mutates ProductSpec without a preview and explicit confirmation; the existing approved change/Figma flow remains green.
- **Current slice:** replace the lifecycle-tab command envelope with a Canvas Program contract, then wire renderer execution, promotion and happy-path smoke evidence end to end.
- **Evidence:** the center surface is a single blank-first infinite tldraw canvas with no lifecycle tabs or implicit ProductSpec projection. Typed Canvas Programs support validated operations and an isolated no-eval virtual script worker; chat and the token-authenticated bridge both receive apply/read-back receipts. The exact onboarding prompt renders its requested 3 nodes and 2 connections, selected-context feedback adds OTP/retry/error branches, and `Chốt flow này thành MVP` opens a hashed promotion preview before committing ProductSpec v2. A second immutable approval executes Figma + Mock Jira + Mock Zdoc through the existing outbox/read-back verification pipeline. `./run.sh smoke-canvas-agent`, `./run.sh smoke-codex-canvas`, `./run.sh smoke-lifecycle`, 93 tests + 1 optional live skip and workspace typecheck pass. Real Codex produced schema-valid nodes but omitted topology in one run; the core labeled and completed it as `provider_augmented` rather than showing disconnected boxes.

### `P0-CAN-006` Intent-gated and receipt-confirmed canvas collaboration

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-CAN-005
- **Deliver:** application-owned interaction intent routing, explicit-draw-only canvas mutation, post-apply/read-back chat confirmation and a complete chat -> canvas -> selected-context edit flow.
- **Acceptance:** ordinary product conversation never mutates a blank canvas even if a provider proposes drawing; an explicit full-flow request produces a connected diagram; an ambiguous edit without a selected/identified target asks for clarification; a selected-context edit mutates only the intended canvas context; chat reports exact applied counts only after a successful receipt/read-back.
- **Follow-up note:** evaluate an explicit `Sync selection/region with chat` control and dirty-canvas awareness after this automatic selection-context loop is stable.
- **Evidence:** application-owned Vietnamese intent routing blocks provider canvas/business commands from crossing conversation/draw/edit/promote boundaries. Request IDs link chat programs to renderer receipts; renderer saves a durable checkpoint before acknowledgement and failure paths cannot claim success. The ride-booking flow creates 18 nodes plus 19 semantic connections, vague `tạo thêm đi chứ` preserves the snapshot, and a selected edit is placed relative to its target. `pnpm test` passes 97 tests + 1 optional live skip, workspace typecheck passes, and both `./run.sh smoke-canvas-agent` and real `./run.sh smoke-codex-canvas` complete promotion plus verified Figma/Mock Jira/Mock Zdoc artifacts.

### `P0-CAN-007` Scene-aware visual canvas

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-CAN-006
- **Deliver:** structured scene inspection, stable graph layout, semantic reconciliation, collision/connection lint, expressive visual grammar and screenshot-verified chat -> canvas -> selected-edit behavior.
- **Acceptance:** generated workflows have no node overlap or disconnected semantic edges; branch edits preserve existing user positions and occupy a free nearby region; shapes, decisions, exceptions and connections are visually distinct; canvas context includes bindings, viewport/selection geometry and recent changes; read-back blocks false success on actionable visual lint.
- **Reference:** adapt the installed `tldraw-offline` patterns for raw shape/binding inspection, stable IDs, higher-level arrangement, screenshot verification and lint without importing its unrestricted live-editor/server boundary into the guarded PM app.
- **Evidence:** `@dagrejs/dagre` now lays out small graphs and selected-context edits; large workflows derive a main journey and wrap it across six-rank serpentine bands with nearby exception lanes. Layout owns generated coordinates, avoids all existing non-arrow bounds and preserves developer-authored explicit positions. Canvas inspection includes semantic bindings, viewport, selected bounds, recent changes and lints; error lints prevent a success receipt. Screen/process/decision/exception nodes and positive/negative edges have distinct visual grammar. The tldraw workbench hides intrusive multi-selection style UI, provides compact native drawing tools, scene health, re-layout and fit controls. `pnpm test` passes 101 tests + 1 optional live skip, workspace typecheck passes and `./run.sh smoke-canvas-agent` passes the complete chat -> 18-node flow -> selected feedback -> ProductSpec promotion -> verified artifacts path; the 2880x1740 flow screenshot was reviewed at a readable 27% fit with all feedback visible.

### `P0-UI-005` Guided continuation, custom answers and canvas prototypes

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-UI-002, P0-CAN-007
- **Deliver:** app-owned custom clarification/decision answers, observable Delivery continuation and a distinct low-fidelity prototype scene path.
- **Acceptance:** every discovery question and MVP decision accepts a bounded user-entered `Khác`; selecting an option produces a visible decision summary plus next actions instead of an empty Delivery state; `Tiếp tục` returns concrete state and choices; an explicit prototype request creates 3-5 inspectable low-fidelity screen frames rather than a generic workflow; canvas receipt identifies the prototype result after durable read-back.
- **Evidence:** clarification and decision panels accept bounded app-owned custom text; the selected decision is recorded as a user action and followed by concrete ProductSpec counts plus a persistent Delivery guide. Prototype intent has a distinct deterministic planner and renders 3-5 movable tldraw frames with editable child components, semantic transitions, scene layout and prototype-specific read-back receipts. `pnpm test` passes 105 tests + 1 optional live skip, workspace typecheck and production build pass, and `./run.sh smoke-lifecycle` verifies a custom clarification, custom decision, visible continuation, 5 prototype frames, 35 child shapes and a durable receipt. The reviewed 2880x1740 screenshot has no scene overlap.

### `P0-CAN-008` Canvas co-creation and prototype scene transformation

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-CAN-007, P0-UI-005
- **Deliver:** a readable domain-specific prototype deck, guided canvas camera, observable agent transaction state, selection-first feedback and explicit canvas-context sync into chat.
- **Acceptance:** a meal-ordering prototype renders 3-5 distinct editable screens in a compact journey without overlap; Overview and Focus selection keep content readable; manual canvas edits expose a dirty state and Sync sends bounded canvas/selection context without silently mutating ProductSpec; agent activity distinguishes reasoning, apply, checkpoint and read-back; lifecycle smoke proves custom decision -> prototype -> manual edit/sync -> receipt and captures a reviewed screenshot.
- **Evidence:** the meal-ordering prototype now renders five distinct 320x520 editable screens as a compact two-row journey with scene title and locked-scope context; Overview and Focus selection provide explicit camera control. Manual tldraw edits set `Chưa sync`; Sync persists the exact snapshot and sends bounded canvas/selection context to chat while preserving ProductSpec v1. Agent activity exposes reasoning, apply, checkpoint and read-back stages, and agent-owned selections no longer open the intrusive style panel. `./run.sh test` passes 106 tests + 1 optional live skip, workspace typecheck and production build pass, and `./run.sh smoke-lifecycle` verifies five frames, 47 editable children, a pointer edit, selection feedback, sync receipt, unchanged ProductSpec and the existing verified artifact path. The final 2880x1740 screenshot was reviewed at a readable 47% overview.

### `P0-CAN-009` Creative conversation and native scene programs

- **Status:** DONE (2026-07-24)
- **Depends on:** P0-CAN-008, P0-AGT-003, P0-HIS-005
- **Deliver:** conversational provider responses plus typed canvas proposals, a rich scene contract for workflows/prototypes, provider-first execution with deterministic fallback only, and structured canvas diff sync.
- **Acceptance:** ordinary discussion leaves a blank canvas untouched; an explicit reminder-backup flow request produces a readable, non-generic scene authored from provider semantic content; a prototype request produces distinct detailed screens without renderer-owned domain lookup; provider output is never replaced by label-count comparison; selecting or editing canvas content and pressing Sync sends a typed bounded diff that the next response can discuss; the existing ProductSpec promotion and artifact approval boundaries remain intact.
- **Happy-path gate:** create thread -> discuss idea -> explicitly request flow -> inspect/edit/select -> Sync -> request prototype -> receive verified canvas receipts, then continue to ProductSpec/Figma approval.
- **Implementation plan:** `project-tracking/CREATIVE_AGENT_IMPLEMENTATION_PLAN.md`.
- **Evidence:** conversation-only turns now use a lightweight provider schema and leave a new thread canvas blank; explicit visual turns carry rich provider-authored workflow/prototype programs with scene metadata, domain content, lanes, states and actions. Natural-language semantics are provider-owned through a typed intent envelope; only `draw/edit` loads the rich Canvas Program schema, while slash canvas commands route directly. Agent Core executes provider proposals first, requires a selected or uniquely resolved target for edit and uses deterministic scenes only when the provider returns no usable program. The renderer dependency-orders operations, lays out variable-height native tldraw cards/screens, persists before receipt and focuses local edits without replacing the complete scene. Sync sends a typed created/updated/moved/deleted `CanvasDiff` plus bounded canvas context. Current workspace typecheck, 134 tests + 1 optional skip, production build, `./run.sh smoke-lifecycle`, `./run.sh smoke-flow` and real `./run.sh smoke-codex-canvas` pass. The latest live Codex gate produced 20 semantic nodes, a provider-source receipt, an 11-operation selected edit, ProductSpec promotion, developer-script apply and verified artifacts.

### `P0-UX-001` Reviewable artifacts, thread activity and export

- **Status:** TODO (paused for P0-FIG-008 on 2026-07-24)
- **Depends on:** P0-HIS-003, P0-CAN-008, P0-FIG-007
- **Deliver:** thread-scoped reasoning UI with a global one-turn lock, stable canvas-context layout, exportable review bundle, domain-specific workflow/prototype generation and a dedicated Figma artifact page.
- **Acceptance:** switching from a reasoning thread to another thread never shows the first thread's pending indicator and cannot start a second turn; selection context never shifts the chat layout; one action exports full chat plus ProductSpec/canvas/workspace evidence; reminder-backup flow and prototype are domain-specific, non-duplicated and screenshot-reviewable; approved Figma output is created on a dedicated page while source ZDS bindings remain guarded.
- **Evidence so far:** renderer tracks the running thread ID while main enforces a tested global turn lock; selection uses a fixed-height slot; one export action writes chat, ProductSpec Markdown/JSON, canvas, workspace and a single attachable review bundle. Reminder-backup planning has 17 specific flow nodes and five detailed prototype screens; redraw replaces the previous scene of the same type while preserving complementary workflow/prototype scenes. Strict Figma apply clones allowlisted source-page ZDS instances into a dedicated named Page and read-back audits that Page. Workspace typecheck/build, 118 non-socket tests, 259 plugin tests/typecheck/build and lifecycle Go tests pass. Remaining acceptance evidence is a live Electron/Figma screenshot review outside the restricted sandbox.

### `P0-UI-003` Artifact preview and approval

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-AGT-004, P0-CAN-002
- **Deliver:** grouped actions, diff/summary, approve/reject, target labels (`Figma`, `Mock Jira`, `Mock Zdoc`).
- **Acceptance:** payload và target rõ ràng; approval status cập nhật theo state machine.
- **Evidence:** grouped exact diff and target labels show immutable approval, rejection and per-target execution/read-back status. Reject creates hashed audit decisions, cancels actions, keeps ProductSpec v1 and queues no outbox. `./run.sh smoke-reject` rejects through UI, previews again and then completes verified sync.

### `P0-UI-004` Change Impact view

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-004, P0-CAN-002
- **Deliver:** impacted highlights, before/after, target action list, partial failure status.
- **Acceptance:** remove-payment impact dễ đọc và không overlap ở demo viewport.
- **Evidence:** impacted highlights, v1→v2 diff, target actions, partial failure and per-target retry are wired. Production preview/recovery screenshots show no overlap; recovery attempts remain Figma 1, Jira 2, Zdoc 1.

## Epic E5 - Mock Jira and Zdoc

### `P0-MCK-001` Connector contract test kit

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-001
- **Deliver:** reusable test suite cho preflight, execute, read-back, verify, idempotency, unavailable.
- **Acceptance:** mọi connector adapter chạy cùng suite tối thiểu.
- **Evidence:** reusable generic suite covers typed availability, zero-mutation preflight, approval policy, idempotent retry, independent read-back/verify and retryable unavailable behavior; Mock Figma passes all cases and the same fixture API is ready for Jira/Zdoc.

### `P0-MCK-002` Mock Jira connector

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-MCK-001, P0-PER-001
- **Deliver:** epic/story create/update/search/read-back, stable IDs, failure injection.
- **Acceptance:** verify Epic link, Requirement IDs, AC và payload hash; retry không duplicate.
- **Evidence:** SQLite external store, deterministic Epic/story IDs, failure injection and read-back verification implemented. Common contract suite plus reopen/idempotency and AC-drift tests pass.

### `P0-MCK-003` Mock Zdoc connector

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-MCK-001, P0-PER-001
- **Deliver:** PRD preview/create/update/read-back, stable page IDs, failure injection.
- **Acceptance:** verify title, spec version, requirement sections và traceability metadata.
- **Evidence:** versioned PRD plan/snapshot, stable page ID, SQLite read-back, requirement/screen/story sections and spec/run traceability checks implemented; common suite and metadata-drift test pass.

## Epic E6 - Figma Design System Guard

### `P0-FIG-000` Resolve baseline serializer contract drift

- **Status:** DONE (2026-07-22)
- **Depends on:** none
- **Deliver:** decide/document rich paint object contract versus legacy hex-string contract; align serializer consumers and tests.
- **Acceptance:** all plugin tests pass; gradients/images/solid opacity behavior has explicit tests; no DS read regression.
- **Evidence:** 253/253 `bun test` pass, plugin typecheck pass and `go test ./...` pass; rich contract documented in `mcp-tool/za-talk-to-figma/docs/paint-serialization-contract.md`.

### `P0-FIG-001` Existing MCP capability adapter and DS context cache

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FIG-000, P0-FND-003, P0-DOM-001
- **Deliver:** stdio process adapter, health/session pinning, typed error mapper, `capture_design_system_context` normalization và synthetic cache fallback.
- **Acceptance:** explicit session/page allowlist; live hoặc fixture DS context có fingerprint/version; không đọc full document không giới hạn.
- **Evidence:** typed MCP SDK follower adapter, immutable target hash, explicit current-page allowlist, typed runtime errors, bounded live capture, deterministic manifest fingerprint, SQLite normalized cache and labeled fixture fallback. `PM_AGENT_FIGMA_LIVE=1` adapter test and production smoke pass against the connected public sandbox; UI screenshot shows target/context readiness.

### `P0-FIG-002` Semantic Figma artifact planner

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FIG-001, P0-DOM-003
- **Deliver:** ScreenSpec -> generic recipe/component intents, flow edges, lifecycle metadata, deterministic layout recipe.
- **Acceptance:** plan không chứa pixel placement do model cung cấp; 4 meal-ordering screens parse hợp lệ.
- **Evidence:** versioned semantic recipe/slot/edge/metadata schemas plus deterministic planner produce all four fixture screens; strict fixture resolution and no-pixel-placement tests pass in `packages/connectors/src/figma-artifact-plan.test.ts`.

### `P0-FIG-003` MCP strict preflight extension

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FIG-002
- **Deliver:** read-only `plan_design_system_screens`, generic role resolver, component/token/layout/metadata/target checks và plan hash.
- **Acceptance:** invalid component/token và non-sandbox target bị block với zero writes; strict/free mode và warning/error phân biệt rõ.
- **Evidence:** MCP tool `plan_design_system_screens` is a pure read-only planner with no runtime/write handle; Go tests block target/component/token mismatches and distinguish strict/free severity. Typed adapter schema validation and live connected-Figma capture -> normalize -> four-screen preflight pass.

### `P0-FIG-004` Figma bridge adapter

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FIG-003, P0-MCK-001
- **Deliver:** `apply_design_system_plan`, lifecycle metadata, stable idempotency lookup, approved plan hash và normalized receipt.
- **Acceptance:** adapter tạo nodes trong sandbox allowlist hoặc trả typed unavailable; không ghi ngoài approved page.
- **Evidence:** MCP enforces preflight/approval hash before dispatch; plugin rechecks current page, writes namespaced metadata, searches idempotency key, returns existing roots on retry and rolls back strict component failures. Typed connector normalizes the result into `ActionReceipt`; Go, plugin and adapter tests pass.

### `P0-FIG-005` Figma read-back and postflight verification

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FIG-004
- **Deliver:** `read_lifecycle_artifact`, `audit_lifecycle_artifact`, snapshot mapper và binding/metadata/edge checks.
- **Acceptance:** execute response không đủ để pass; node thiếu requirement metadata bị fail verification.
- **Evidence:** `read_lifecycle_artifact` independently searches plugin data and returns a bounded snapshot; `audit_lifecycle_artifact` checks target/plan/idempotency, screen requirement metadata, component roles, primitive fallbacks and edges. Both Go and TypeScript tests fail a tampered requirement mapping.

### `P0-FIG-006` Offline Figma mock parity

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FIG-002, P0-MCK-001
- **Deliver:** mock execute/read-back/postflight với cùng plan/snapshot contract.
- **Acceptance:** demo có thể chuyển sang fallback rõ nhãn mà không đổi ProductSpec/workflow.
- **Evidence:** `MockFigmaArtifactConnector` implements the same plan/preflight/execute/read-back/verify contract, stable idempotency and failure injection; parity tests prove no duplicate and verification mismatch behavior.

### `P0-FIG-007` Same-file ZDS instance catalog

- **Status:** DONE (2026-07-23)
- **Depends on:** P0-FIG-001, P0-FIG-003, P0-FIG-005
- **Deliver:** bounded discovery of copied ZDS instances in the allowlisted public framework page, manifest source bindings for same-file instances, strict clone/apply and independent instance-backed read-back.
- **Acceptance:** the public Zalo Mini App Framework resolves the demo roles without synthetic component keys; strict preflight has zero primitive fallback; apply clones allowlisted ZDS instances and read-back verifies their source bindings; onboarding recipes use concrete input/OTP/status roles.
- **Evidence:** live discovery returns 199 representative ZDS instances and resolves header/button/input/OTP/list/status/modal roles. Strict app smoke cloned light/default ZDS instances into Figma node `449:16909`, then independently verified every slot as instance-backed with matching source bindings. Workspace has 114 tests pass plus one optional skip; plugin has 259 pass; Go suite, typecheck, build and live smoke pass.

### `P0-FIG-008` Product-grade Figma design synthesis

- **Status:** DONE (2026-07-24)
- **Depends on:** P0-FIG-007, P0-UX-001
- **Deliver:** a Design Blueprint contract with product-specific art direction, screen archetypes, content/state coverage and a Figma compositor that combines those decisions with allowlisted ZDS instances on a dedicated output Page.
- **Acceptance:** reminder-backup output communicates a coherent product concept instead of repeating generic wireframe slots; screens have distinct hierarchy and domain content; strict mode still uses verified same-file ZDS instances; read-back independently proves the rendered design brief, archetype and presentation sections; TypeScript, plugin and Go hash/audit contracts agree.
- **Evidence:** Provider-owned Creative Figma Blueprints now carry free composition, product copy, primitives, exact ZDS roles and prototype edges; Agent Core owns traceability, target, approval and read-back rather than a fixed wireframe compositor. A connected Figma Desktop run captured 190 copied ZDS instances into 25 semantic same-file bindings plus 9 tokens with no fallback. Codex planned a 4-screen/51-layer concept in 181s; approved apply recovered an incomplete agent-owned page, wrote in 4.7s, read back in 0.5s and verified 16 real ZDS instances, 4 distinct screens and 4 navigation edges at root `489:16542`. The exported 2248x1024 bitmap was visually reviewed. Immutable prepared preflight, cross-runtime hash ownership, operation budgets, follower deadlines, content-fit copy and incomplete-page recovery have regression coverage.

### `P0-FIG-009` Stable ZDS source binding

- **Status:** DONE (2026-07-24)
- **Depends on:** P0-FIG-008
- **Deliver:** keep the allowlisted ZDS source distinct from generated artifact Pages, expose explicit rebinding and reject unusable semantic manifests before provider planning.
- **Acceptance:** generated `PM · ...` Pages cannot be selected as the ZDS source; setup can rebind even when a target already exists; unmapped local components do not produce a false live-ready state; missing ProductSpec roles fail once with an actionable source-page message instead of per-slot preflight noise.
- **Evidence:** explicit pinning still requires the visible Page, while subsequent target verification and plugin apply/read-back resolve the immutable source Page by ID even when the user is viewing an output Page. Setup always exposes rebind and refuses managed artifact Page names. Unmapped local components are excluded from live readiness, and ProductSpec role coverage is checked before provider planning. After plugin reload, the connected login thread prepared a live immutable 4-screen/45-layer blueprint in 175 seconds with the source still bound to `[PUBLIC] ... / Page 1`. Workspace has 148 tests plus one optional skip; plugin has 263 tests; Go suite, typecheck, production build and package smoke pass.

### `P0-CRE-001` Creative Studio conversation and agentic Figma craft

- **Status:** IN_PROGRESS (2026-07-24)
- **Depends on:** P0-CAN-009, P0-FIG-009, P0-PRV-001
- **Deliver:** a conversation-first collaboration contract that does not force ordinary chat through lifecycle phase payloads, plus an approved Figma design worker that can use the allowlisted MCP iteratively, inspect screenshots, refine visual defects and return structured read-back evidence.
- **Acceptance:** ordinary product discussion can critique, suggest and offer optional next actions without creating clarification/decision checkpoints; drawing, promotion and artifact writes occur only after explicit user intent; Figma creation uses a dedicated output Page, real ZDS controls and at least one screenshot-review/refine pass; progress names the current design stage; the worker remains bounded to the approved task/session/page and connector verification still reads back traceability, component adoption and prototype coverage.
- **Evidence:** conversation routing now uses a compact collaboration schema with optional content-specific suggestions; selection is context rather than implicit edit permission, and `/studio explore|critique|sketch|refine` gives explicit control over conversation versus canvas writes. Approved live Figma work now starts from a sparse guarded scaffold, runs a bounded Codex MCP craft worker with a repository skill, requires observed screenshot/write/audit evidence and repairs the same Page from independent QA findings. The MCP exposes `apply_craft_patch` for 1-80 alias-linked operations and `audit_product_craft` for screen/ZDS/prototype/copy/contrast/clipping gates. A direct live run on `EXP · Login craft · sparse-skill-v2` produced and repaired a five-screen ZaloPass journey; final read-back passed with 18 real ZDS instances, five prototype links, 44 visible text nodes and zero audit issues across 415 nodes. Visual evidence: `mcp-tool/za-talk-to-figma/artifacts/zalo-login-craft-audited.png`. Workspace has 158 passing tests plus one optional skip; plugin has 268 passing tests; Go suite, typecheck, build and production smoke pass. Remaining acceptance: complete one full app-owned live worker execution after Codex usage quota is available; the direct forward test preserved its partial Page and stopped on provider quota rather than MCP failure.

## Epic E7 - Change synchronization

### `P0-CHG-001` Change intent and impact preview

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-DOM-004, P0-UI-004
- **Deliver:** structured change request, ambiguity handling, immutable impact set and diff.
- **Acceptance:** preview không mutate state; ambiguous target chuyển `NEEDS_USER_INPUT`.
- **Evidence:** Agent Core resolves exact stable IDs, semantic title/alias and explicit canvas selection before impact analysis. Ambiguous requests persist `NEEDS_USER_INPUT` with candidate IDs and survive restart without preview, actions or ProductSpec mutation. `./run.sh smoke-ambiguity` proves the clarification UI and subsequent resolved request complete the verified v2 flow.

### `P0-CHG-002` Approved ProductSpec version update

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-CHG-001, P0-AGT-004, P0-PER-002
- **Deliver:** version bump, removed scope semantics, new artifact action plans.
- **Acceptance:** reject/cancel giữ version cũ; approval commit atomic.
- **Evidence:** ProductSpec v2/actions/approvals/outbox commit atomically with injected rollback coverage; rejection audit leaves v1 and no outbox. Reject-then-approve production smoke passes.

### `P0-CHG-003` Multi-target execute and partial retry

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-CHG-002, P0-FIG-005, P0-MCK-002, P0-MCK-003
- **Deliver:** sync Figma + mock Jira/Zdoc, per-target receipts/status, retry failed target.
- **Acceptance:** một target fail không duplicate target đã pass; ít nhất hai target verified sau retry.
- **Evidence:** Figma + Mock Jira + Mock Zdoc execute qua durable outbox và hiển thị receipt/read-back status theo target. `./run.sh smoke-recovery` inject Jira failure, retries qua UI, kết thúc verified với attempts `1/2/1`; Figma/Zdoc attempts và external IDs không đổi, đồng thời lưu screenshot partial-failure.

## Epic E8 - Quality and demo

### `P0-QA-001` Unit and contract test gates

- **Status:** TODO (paused for P0-UX-001 on 2026-07-23)
- **Depends on:** all P0 domain/core/connectors
- **Deliver:** coverage cho invariants, transitions, impact, approval, idempotency, connector parity.
- **Acceptance:** critical test matrix gồm provider/history/canvas/connector trong `TEST_AND_DEMO_PLAN.md` pass.
- **Current slice:** reconcile the documented critical matrix against the 112-test suite and dedicated production smoke modes; add or record evidence for any uncovered P0 contract.
- **Progress:** lifecycle production smoke now also proves a newly created `IDEA_INTAKE` thread switches ThreadDetail/workspace atomically, has a null snapshot and contains zero canonical canvas shapes before the first message.
- **Progress:** active reasoning is now phase/status-gated; lifecycle smoke proves decision options disappear after the first valid selection and duplicate selection is idempotent in Delivery.
- **Progress:** lifecycle smoke now also covers custom discovery/decision input, observable Delivery continuation and editable prototype frame creation with durable canvas read-back.
- **Progress:** live release path now proves an app-owned approval produces a non-mock Figma receipt, independent read-back/audit and a Markdown PRD; Jira and Zdoc remain clearly labeled mocks.

### `P0-QA-002` Desktop E2E happy path

- **Status:** TODO
- **Depends on:** P0-CHG-003
- **Deliver:** Playwright Electron flow từ reset đến verified change.
- **Acceptance:** test chạy deterministic, tạo/resume thread và lưu screenshot ở các signature checkpoints.

### `P0-QA-003` Failure and recovery E2E

- **Status:** TODO
- **Depends on:** P0-QA-002
- **Deliver:** unavailable Figma, crash-after-write, verification mismatch, partial failure/retry.
- **Acceptance:** UI không báo success sai; run recover được sau restart.

### `P0-DEM-001` Demo mode and reset

- **Status:** TODO
- **Depends on:** P0-QA-002
- **Deliver:** seeded DB, reset command/control, connection status, fallback switch, demo-safe logs.
- **Acceptance:** ba lần reset/run liên tiếp cho cùng expected result.

### `P0-DEM-002` Package and rehearsal

- **Status:** TODO
- **Depends on:** P0-DEM-001, P0-QA-003
- **Deliver:** macOS package, demo script, backup screenshots/video, timing notes.
- **Acceptance:** clean-profile smoke test pass; full demo nằm trong timebox đã chọn.

## P1 sau khi P0 ổn định

| ID | Item | Điều kiện kéo vào |
| --- | --- | --- |
| `P1-PRV-001` | OpenAI Responses adapter | Provider conformance kit ổn định; chưa được chọn làm release slot |
| `P1-PRV-002` | Gemini Interactions adapter | Provider conformance kit ổn định; chưa được chọn làm release slot |
| `P1-PRV-003` | Anthropic Messages adapter | Provider conformance kit ổn định; chưa được chọn làm release slot |
| `P1-EXP-001` | ProductSpec import/export | Demo reset đã ổn định |
| `P1-HIS-006` | Branch/fork thread from checkpoint | P0 resume và canvas isolation ổn định |
| `P1-HIS-007` | Full ProductSpec/canvas version browser | Change diff P0 hoàn chỉnh |
| `P1-CAN-004` | Durable Dev Canvas Bridge inbox, idempotency, apply acknowledgement, normalized shape reads and screenshot/lint endpoints | P0 semantic bridge contract ổn định |
| `P1-ZDC-001` | Zdoc real sandbox connector | Được phép và có sandbox chính thức |
| `P1-JIR-001` | Jira real sandbox connector | Được phép và có sandbox chính thức |

## Blocker register

| ID | Blocker | Owner | Workaround | Status |
| --- | --- | --- | --- | --- |
| `BLK-001` | Schema/protocol Figma bridge | Team | Đã review source: stdio MCP + local WS, 98 tools, session routing và DS workflows | RESOLVED |
| `BLK-002` | Chưa có sanitized Zalo Design System manifest | Team/Design | Public framework duplicate is now captured as an allowlisted same-file ZDS instance catalog | RESOLVED |
| `BLK-003` | Chưa xác nhận quyền dùng tldraw cho demo/pilot | Team | Review license trước packaging | OPEN |
| `BLK-004` | Chưa chọn real API provider cho release slot | Team | Probe credential/runtime, chọn sau provider conformance kit | OPEN |
