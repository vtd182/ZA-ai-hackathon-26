# Project Memory

File này là bộ nhớ làm việc bền vững cho người và coding agent. Đọc file này ở đầu mỗi phiên implementation; cập nhật ở cuối phiên hoặc ngay khi phát hiện bug/decision/caveat đáng nhớ.

Không ghi secret, token, PII, chain-of-thought, production URL, customer data hoặc nội dung nội bộ nhạy cảm.

## 1. North star

PM Lifecycle Agent giúp Product Team trong hệ sinh thái Zalo biến ý tưởng OA/Mini App/Bot thành kickoff package nhất quán, có evidence, traceability, human approval và verified change synchronization.

Signature moment:

> `Bỏ payment khỏi MVP` -> đúng impact set -> before/after -> approval -> ProductSpec version mới -> Figma + mock artifacts cập nhật và read-back verified.

## 2. Stable facts

- Competition track phù hợp nhất: Workflow Automation Agent.
- ProductSpec là business source of truth.
- SQLite là local execution memory/checkpoint/outbox/audit store.
- CanvasDocument/tldraw là creative visual source of truth cho nội dung chưa promote; ProductSpec là business source of truth sau khi người dùng xác nhận promotion.
- Reasoning provider đề xuất; Agent Core sở hữu workflow, policy, state, approval, retry và verification.
- Provider dùng native adapters và normalized events; app-owned checkpoint cho phép switch tại safe boundary.
- Codex integration ưu tiên `codex app-server` qua stdio; remote provider state không phải nguồn resume duy nhất.
- Mỗi ConversationThread trong history sở hữu đúng một CanvasDocument; turn tạo checkpoint/version.
- Figma là integration ưu tiên và phải hoạt động như Zalo Design System guard.
- `mcp-tool/za-talk-to-figma` là runtime có sẵn cần mở rộng, không xây lại từ đầu.
- Jira và Zdoc được mock trong MVP; mock phải có contract gần thật và nhãn rõ ràng.
- Mọi write action cần approval; payload thay đổi làm approval mất hiệu lực.
- Tool/HTTP success không đồng nghĩa verified.
- Demo dùng fixture/sandbox đã làm sạch, không dùng production/internal/customer/PII data.
- Offline/deterministic demo path là P0.

## 3. Current status

- **Date:** 2026-07-23
- **Milestone:** M2 guarded artifact execution and demo readiness.
- **Completed task:** `P0-FND-001` Bootstrap workspace.
- **Completed tasks:** Foundation/fixtures/domain schemas, workflow state machine, ProductSpec invariants, deterministic impact graph and immutable approval policy.
- **Completed tasks:** Foundation/domain workflow plus typed signature change preview, approval and persisted ProductSpec v2 projection.
- **Completed task:** `P0-FIG-001` typed MCP adapter, explicit session/page allowlist, bounded DS capture, normalized cache and synthetic fallback.
- **Completed task:** `P0-FIG-002` deterministic semantic recipes for four meal-ordering screens, with lifecycle metadata and no provider-controlled pixel placement.
- **Completed task:** `P0-FIG-003` added read-only MCP strict preflight with exact target, manifest, role/token resolution and immutable plan hash; live adapter test passes against the connected Figma session.
- **Completed tasks:** `P0-FIG-004/005/006` approved/idempotent Figma apply, independent plugin-data read-back, strict postflight audit and offline parity connector.
- **Completed task:** `P0-MCK-001` reusable connector conformance kit now locks availability, preflight, approval, idempotency, read-back, verification and unavailable semantics.
- **Completed tasks:** `P0-MCK-002/003` SQLite-backed Mock Jira and Mock Zdoc pass the common connector suite, durable retry and traceability tamper tests.
- **Completed task:** `P0-AGT-005` receipt-first outbox execution and verification orchestration; production smoke read-back verifies Figma, Mock Jira and Mock Zdoc.
- **Completed task:** `P0-CHG-003` multi-target partial retry; deterministic recovery smoke proves successful targets are not duplicated.
- **Completed task:** `P0-FND-003` deterministic demo fixtures and reset; three repeated resets produce identical canonical state.
- **Completed task:** `P0-AGT-001` phase-specific reasoning contracts and malformed-output guard; real Codex and Mock smoke pass.
- **Completed task:** `P0-AGT-002` Idea -> Discovery -> `WAITING_FOR_DECISION` orchestration with persisted/reopened reasoning checkpoints.
- **Completed task:** `P0-AGT-003` normalized provider events/capabilities; partial streams cannot mutate state and real Codex smoke passes.
- **Completed task:** `P0-PRV-001` canonical handoff and safe provider switching with paid confirmation and capability snapshots.
- **Completed task:** `P0-UI-002` clarification/decision workspace and ProductSpec inspector; lifecycle UI smoke passes with persisted resume.
- **Completed tasks:** `P0-UI-003`, `P0-UI-004` and `P0-CHG-002`; approve/reject/partial-retry UI paths all have production smoke evidence.
- **Completed tasks:** `P0-PER-001/002` migration ledger, full local schema and atomic checkpoint transactions; clean-profile smoke passes.
- **Completed task:** `P0-HIS-001` turn/event repositories, FTS5 and cursor pagination with bounded renderer hydration.
- **Completed task:** `P0-HIS-002` full offline restart and stale opaque provider ref replacement.
- **Completed task:** `P0-HIS-004` one stable CanvasDocument per thread with A/B restart/checkpoint evidence.
- **Completed task:** `P0-CAN-001` versioned entity/edge projection contract, deterministic four-view layout and semantic traceability arrows.
- **Completed tasks:** `P0-CAN-002` and `P0-HIS-005` guarded bidirectional canvas commands with an explicit business/presentation undo boundary.
- **Completed task:** `P0-CHG-001` exact/semantic change resolution and persisted `NEEDS_USER_INPUT` ambiguity handling.
- **Completed task:** `P0-CAN-003` free Board, optional managed lifecycle filters, semantic workflows, spatial selection context and guarded Dev Canvas Bridge/skill.
- **Completed task:** `P0-CAN-005` tldraw-first canvas agent runtime, explicit ProductSpec promotion and verified promoted-artifact execution.
- **Completed task:** `P0-CAN-006` application-owned intent routing and receipt-confirmed bidirectional canvas collaboration.
- **Completed task:** `P0-UI-005` guided continuation, custom answers and canvas prototypes.
- **Completed task:** `P0-CAN-008` canvas co-creation and prototype scene transformation.
- **Current task:** `P0-QA-001` unit and contract test gates is `IN_PROGRESS`.
- **Current slice:** Reconcile the documented critical matrix against the 106-test suite and dedicated production smoke modes; add or record evidence for any uncovered P0 contract.
- **Last known repository state:** Runnable Electron app with one blank-first infinite canvas per thread, typed Canvas Programs, Mock/Codex provider paths, explicit ProductSpec promotion, deterministic impact preview, approval/outbox/read-back verification and a verified live Figma read connection.
- **Known blockers:** Connected public framework page exposes styles/text evidence but zero components in the allowlisted source subtree, so the guard correctly uses a labeled synthetic fixture; cần trial/commercial/hobby tldraw license key trước production packaging; OpenAI/Gemini/Anthropic adapters chưa thể live-test khi không có API key.
- **Audit note:** `project-tracking/READINESS_AUDIT.md` is the 2026-07-22 code-versus-acceptance baseline. Tickets with useful partial code remain `TODO` until every acceptance criterion is evidenced.

## 4. Important implementation notes

### State and schemas

- Mọi schema có `schemaVersion`.
- Stable IDs không phụ thuộc array index hoặc canvas shape ID.
- ProductSpec relationships phải được validate trước persist và trước artifact planning.
- Persist checkpoint ở stage boundary; không coi model thread là resumable state.

### Approval and execution

- Approval record giữ action ID, payload hash, approver/time và scope.
- Lưu receipt trước khi verify để recover crash-after-write.
- Retry kiểm local receipt, external search/idempotency metadata rồi mới create.
- Partial failure giữ thành công đã xảy ra; retry theo target, không rollback giả.

### Canvas

- Một thread mới hydrate một CanvasDocument rỗng; không tự project demo ProductSpec hoặc starter components.
- Canvas presentation operations may auto-apply as one undoable transaction, but promotion into ProductSpec always requires preview plus explicit confirmation.
- Provider and developer agents receive bounded normalized canvas context and return a validated Canvas Program. Script mode runs against a virtual canvas API with no filesystem, network or Electron IPC.
- Generated coordinates belong to the scene-layout layer. Small/local graphs use Dagre; large workflows use a topology-derived wrapped journey with nearby exception lanes.
- Canvas inspect/read-back includes bindings, viewport, selected bounds, recent changes and lint. Overlap/dangling-edge errors must block success.
- ProductSpec/Figma/Jira/Zdoc remain guarded semantic outputs; raw canvas shapes are never sent directly to external connectors.

### Figma guard

- DesignSystemManifest phải ghi rõ `fixture`, `sanitized_export` hoặc nguồn được phép.
- Unknown/deprecated component và raw token/style là preflight error.
- Metadata tối thiểu trên node: runId, screenId, requirementIds, specVersion, idempotency key.
- Postflight dùng read-back snapshot từ Figma/mock store.
- Target file/page phải ở sandbox allowlist.
- MCP hiện có 98 tools, stdio transport, local WebSocket plugin bridge, multi-session routing và typed error contract.
- Existing DS apply đang hard-code registration form slots và cho phép primitive fallback; strict hackathon flow cần generic recipe + zero-write preflight.
- Pin explicit Figma `sessionId`; không dựa vào global active route.

### Providers

- Không dùng OpenAI-compatible facade làm core abstraction.
- Codex/OpenAI/Gemini/Anthropic giữ SDK/protocol types bên trong adapter.
- ProviderSegment lưu provider/model/capability snapshot và opaque remote session ref.
- Switch tạo HandoffPackage từ ProductSpec, checkpoint, recent messages và pending actions; không chuyển hidden reasoning.
- Provider tool call chỉ là ProposedAction; Agent Core validate/approve/execute.
- Remote conversation storage/retention policy phải hiển thị trong Runtime Setup.

### History, chat and canvas

- Một history item = một ConversationThread = một CanvasDocument.
- Inactive canvas được serialize/unmount; chỉ hydrate active thread.
- Paginate/virtualize history và messages; không đưa full transcript vào renderer state.
- Chat và canvas gestures cùng đi qua domain commands.
- Batch provider deltas/canvas patches; không persist mỗi token hoặc pointer move.

### Jira/Zdoc mocks

- Không mock bằng `return { success: true }`.
- Có external store riêng, stable ID, search/read-back, latency/failure injection và verification.
- UI/pitch luôn hiển thị rõ `Mock Jira`, `Mock Zdoc`.

## 5. Bug and fix log

### BUG-001 - Figma plugin serializer contract drift

- **Status:** FIXED
- **Found:** 2026-07-22, baseline MCP review before PM app implementation.
- **Symptom:** `bun test` reports 9 failures in `serializers.test.ts`; 242 tests pass.
- **Trigger:** Run plugin test suite. Failures expect solid paints as hex strings and non-solid paints to be discarded.
- **Root cause:** Confirmed implementation/test contract mismatch. `serializePaints` now returns structured paint objects and preserves gradients/images, while tests still assert the older hex-only contract. Product intent for the new rich shape must be confirmed before changing either side.
- **Fix:** Preserved rich structured paint data, documented the response contract and updated stale tests. Go `extractPrimaryColor` keeps compatibility with typed objects and legacy hex arrays.
- **Regression test:** Existing `serializers.test.ts` plus new gradient/image/opacity contract cases; full `bun test` must pass.
- **Caveat:** Do not revert to hex-only output; gradients, images and opacity are required for DS audit fidelity.

### BUG-002 - Electron preload ESM caused a white window

- **Status:** FIXED
- **Found:** 2026-07-22, `P0-FND-001` runtime smoke.
- **Symptom:** Electron window trắng; renderer crash vì `window.pmAgent` undefined.
- **Trigger:** Sandboxed preload được Electron Vite emit thành `index.mjs`.
- **Root cause:** Electron sandbox loader nạp preload theo CommonJS và reject `import` syntax.
- **Fix:** Force preload Rollup output thành `index.cjs`, cập nhật BrowserWindow preload path và thêm renderer error boundary.
- **Regression test:** `./run.sh smoke` kiểm `window.pmAgent`, canvas và chat IPC trong production build.
- **Caveat:** Giữ `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; không sửa bằng cách hạ security flags.

### BUG-003 - tldraw canvas/session and static asset bootstrap

- **Status:** FIXED
- **Found:** 2026-07-22, `P0-FND-001` visual smoke.
- **Symptom:** `Session state is not ready yet`; CDN icon/translation bị CSP chặn.
- **Trigger:** Seed shape qua external `createTLStore` trong mount lifecycle và dùng default tldraw CDN assets.
- **Root cause:** Editor session chưa sẵn sàng ở lifecycle đang dùng; Vite prebundle `@tldraw/assets/imports.vite` trước khi xử lý `?url` làm URL local thành undefined.
- **Fix:** Để `<Tldraw>` sở hữu store/session, hydrate bằng `snapshot`; self-host qua `@tldraw/assets` và exclude helper asset khỏi Vite optimizeDeps.
- **Regression test:** Mock/Codex smoke xác nhận `.tl-container`, seed `REQ-PAYMENT`, local assets và chat-to-canvas outcome.
- **Caveat:** SDK được dùng qua npm package chính thức; production cần license key hợp lệ.

### BUG-004 - Codex model/schema compatibility

- **Status:** FIXED
- **Found:** 2026-07-22, `P0-FND-001` Codex smoke.
- **Symptom:** `gpt-5.6-sol` yêu cầu Codex mới hơn; sau đó output schema bị reject vì nested `oneOf`.
- **Trigger:** Run Codex App Server adapter bằng CLI 0.132.0.
- **Root cause:** Profile model không khớp `model/list` của CLI; provider structured-output subset không hỗ trợ `oneOf` tại commands item.
- **Fix:** Migrate Codex profile sang default `gpt-5.5`; dùng fixed nullable command envelope rồi parse về discriminated union nội bộ.
- **Regression test:** `PM_AGENT_SMOKE_PROVIDER=codex-local ./run.sh smoke` pass một turn thật qua `codex app-server`.
- **Caveat:** Model IDs vẫn editable; nên capability-discover `model/list` trong Runtime Settings ở task provider hardening.

### BUG-005 - Canvas phase filter raced editor mount

- **Status:** FIXED
- **Found:** 2026-07-22, Figma setup smoke visual review.
- **Symptom:** Phase tab label đổi nhưng canvas có thể vẫn hiển thị shapes của phase trước trên startup.
- **Trigger:** Initial phase filter effect chạy trước khi lazy tldraw editor mount xong.
- **Root cause:** Effect phụ thuộc phase/snapshot nhưng editor nằm trong ref; ref ready không tạo React render mới nên filter không chạy lại.
- **Fix:** Increment `editorEpoch` trong tldraw mount callback và dùng epoch làm dependency cho projection filter.
- **Regression test:** Production smoke verifies the signature change projection after editor mount; screenshot review confirms only the five impacted entities are visible in Change phase.
- **Caveat:** Giữ editor lifecycle signal nếu sau này tách canvas thành worker hoặc unmount khi đổi thread.

### BUG-006 - Electron main used CommonJS path globals after ESM bundling

- **Status:** FIXED
- **Found:** 2026-07-22, live Figma production smoke.
- **Symptom:** Production smoke không mở window và log `ReferenceError: __dirname is not defined`.
- **Trigger:** Bundle MCP SDK into the Electron main ESM output.
- **Root cause:** Runtime and BrowserWindow asset path resolution still referenced the CommonJS-only `__dirname` global.
- **Fix:** Derive `moduleDirectory` from `fileURLToPath(import.meta.url)` and use it for repository, preload and renderer paths.
- **Regression test:** `PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke` builds ESM main, opens the window, allowlists the live page and reaches context-ready state.
- **Caveat:** New main-process path logic must remain ESM-safe; do not reintroduce `__dirname` or `require.resolve` without an ESM bridge.

### BUG-007 - SQLite recovery timestamp was not ISO 8601

- **Status:** FIXED
- **Found:** 2026-07-22, `P0-AGT-005` restart recovery test.
- **Symptom:** Reopening an outbox with interrupted work failed Zod datetime parsing.
- **Trigger:** Recover an `executing` or `verifying` action after closing and reopening SQLite.
- **Root cause:** SQLite `datetime('now')` emits `YYYY-MM-DD HH:mm:ss`, while canonical domain schemas require ISO 8601 with `T` and timezone.
- **Fix:** Recovery writes `new Date().toISOString()` as a bound value.
- **Regression test:** `packages/persistence/src/outbox-store.test.ts` reopens receipt-backed work and completes verification without duplicate execution.
- **Caveat:** Persistence code must not use SQLite datetime formatting for domain timestamps.

### BUG-008 - Canvas undo crossed the projection hydration boundary

- **Status:** FIXED
- **Found:** 2026-07-22, `P0-CAN-002` drag/undo/delete production smoke.
- **Symptom:** After dragging and undoing a canonical card, Delete could restore/remove a legacy snapshot shape without emitting the guarded domain proposal.
- **Trigger:** Hydrate/reconcile ProductSpec shapes, drag one shape, press undo, then Delete.
- **Root cause:** ProductSpec reconciliation and view-opacity updates were recorded in tldraw's user undo history; metadata-only delete guards were also vulnerable to older snapshots.
- **Fix:** Run projection reconciliation/filtering with `history: 'ignore'` and guard canonical entities through a stable shape-ID-to-ProductSpec map.
- **Regression test:** `./run.sh smoke-canvas` requires drag-only presentation state, position undo, blocked canonical deletion, unchanged ProductSpec v1 and a validated approval preview.
- **Caveat:** Renderer-owned projection updates must stay outside tldraw user history; domain undo remains a separate future workflow command.

### BUG-009 - New thread projected the demo canvas before idea intake

- **Status:** FIXED
- **Found:** 2026-07-22, manual new-chat verification during `P0-QA-001`.
- **Symptom:** Clicking `Cuộc hội thoại mới` appeared to reuse the previous canvas instead of opening a blank workspace.
- **Trigger:** Create a thread and open its freshly initialized `IDEA_INTAKE` workspace before sending the first idea.
- **Root cause:** The new thread correctly had `canvasSnapshot = null`, but the UI set `activeThread` before awaiting its workspace. One render could therefore mount the new keyed canvas with the previous thread's ProductSpec; later hiding projection in `IDEA_INTAKE` did not remove the already-created shapes, which canvas autosave then persisted.
- **Fix:** Keep the old workspace hidden behind loading, fetch the new ThreadDetail and lifecycle workspace first, then switch both states together and clear selection/command batches. Canonical projection also remains suppressed until the first validated Discovery transition. The seeded demo thread is unchanged.
- **Regression test:** `./run.sh smoke-lifecycle` now requires a null snapshot and zero canonical tldraw shapes before the first message, then completes clarification, decision, resume and verified change sync.
- **Caveat:** This is a projection rule, not an empty fake ProductSpec; Agent Core still owns a schema-valid run state from thread creation.

### BUG-010 - Renderer HMR outran the Electron preload

- **Status:** FIXED
- **Found:** 2026-07-22, manual canonical-shape delete after adding `canvas.proposeCommand`.
- **Symptom:** Delete showed `window.pmAgent.canvas.proposeCommand is not a function` and the canonical shape remained.
- **Trigger:** Keep an Electron dev process open while renderer code hot-reloads after the preload API contract changes.
- **Root cause:** Renderer HMR can update React code without replacing the already-loaded context-isolated preload object.
- **Fix:** Guard the capability at runtime and show an explicit full-restart instruction instead of a raw TypeError; production builds and fresh dev starts load the matching preload.
- **Regression test:** Workspace typecheck locks the shared `DesktopApi`; production `smoke-lifecycle` builds and loads main/preload/renderer together and passes.
- **Caveat:** Any preload or IPC contract edit requires fully quitting and restarting Electron; renderer HMR alone is insufficient.

### BUG-011 - Completed decision checkpoint remained actionable

- **Status:** FIXED
- **Found:** 2026-07-23, manual lifecycle flow after selecting an MVP option.
- **Symptom:** Decision cards remained visible after the run entered Delivery; clicking one again surfaced `DELIVERY/ACTIVE -> SELECT_OPTION` as an invalid transition.
- **Trigger:** Select a decision option, wait for Delivery, then click an option from the stale panel again.
- **Root cause:** `workspaceFor()` exposed the latest persisted reasoning checkpoint without checking whether its phase/status still matched the canonical RunState. Persistence history was incorrectly treated as active UI state.
- **Fix:** Expose discovery/decision reasoning only for their exact active state, hide the panel after transition, and make a duplicate selection arriving in Delivery return the current workspace idempotently.
- **Regression test:** `./run.sh smoke-lifecycle` now requires `delivered=true` and `optionsCleared=true` before resuming the demo thread.
- **Caveat:** Historical reasoning checkpoints remain queryable for audit/resume; UI actionability must always be derived from RunState.

### BUG-012 - Irrelevant provider view field failed the whole turn

- **Status:** FIXED
- **Found:** 2026-07-23, real Codex chat turn using canvas commands.
- **Symptom:** `chat:send` failed because `commands[*].view` contained a non-lifecycle label such as `workflow` instead of `discover|decide|deliver|change`.
- **Trigger:** A provider fills every field in the fixed structured-output envelope and uses a free-canvas concept for `view`, including on commands that do not consume that field.
- **Root cause:** The provider wire envelope exists for structured-output compatibility, but it was parsed directly as the stricter internal discriminated union. Irrelevant nullable fields were incorrectly treated as domain command fields.
- **Fix:** Normalize the wire envelope by command type before domain parsing: ignore irrelevant fields, default legacy add-card view to the current phase, discard only an invalid `switch_view`, and continue rejecting unknown or incomplete commands. Added semantic node/connection commands for free-canvas diagrams.
- **Regression test:** `packages/domain/src/index.test.ts` reproduces three commands with `view: workflow`; full suite passes with 89 tests and one optional live test skipped.
- **Caveat:** Provider output remains untrusted; normalization is deliberately narrow and must not become a general malformed-output fallback.

### BUG-013 - New threads inherited the demo ProductSpec behind a free canvas

- **Status:** FIXED
- **Found:** 2026-07-23, visual review of semantic workflow smoke.
- **Symptom:** A new workflow thread showed meal-ordering cards behind the flow and inspector counts `3 Req / 4 Screen / 2 Story` even though the user never requested that product.
- **Trigger:** Send the first message in any non-demo thread, then create a freeform workflow on Board.
- **Root cause:** Every run initialized from `mealOrderingProductSpec`, and Board treated managed ProductSpec projections as always visible. Hiding the projection only during Idea Intake masked the underlying cross-thread fixture contamination.
- **Fix:** Only the deterministic demo thread uses meal-ordering data. Normal threads receive an isolated schema-valid empty draft; Board hides managed projections, while lifecycle filters reveal them without hiding freeform shapes.
- **Regression test:** `createDraftProductSpec` unit coverage, `./run.sh smoke-lifecycle`, and `./run.sh smoke-flow`; screenshot review confirms a clean three-node flow and `0 Req / 0 Screen / 0 Story`.
- **Caveat:** Generating a rich ProductSpec from a selected option remains a separate lifecycle capability; an empty draft must not be pitched as a generated delivery spec.

### BUG-014 - Nullable legacy command invalidated a valid Codex Canvas Program

- **Status:** FIXED
- **Found:** 2026-07-23, real Codex canvas smoke.
- **Symptom:** `chat:send` rejected an otherwise valid Canvas Program because a recognized legacy command carried `query: null`.
- **Root cause:** Provider fixed-envelope normalization preserved malformed recognized commands and the discriminated union then parsed nullable fields as required strings.
- **Fix:** Drop incomplete recognized legacy commands after normalization while preserving unknown command types so unsafe/unsupported commands still fail closed.
- **Regression test:** Domain contract test covers nullable `remove_card`/connection envelopes; `./run.sh smoke-codex-canvas` parses the native response and completes verified artifacts.
- **Caveat:** Never silently drop unknown command types; only known fixed-envelope variants may be normalized away.

### BUG-015 - Canvas script worker depended on unsafe eval

- **Status:** FIXED
- **Found:** 2026-07-23, developer script smoke.
- **Symptom:** Worker execution failed under renderer CSP because `new Function` requires `unsafe-eval`.
- **Root cause:** The initial sandbox used dynamic JavaScript compilation even though the exposed API was intentionally small.
- **Fix:** Interpret the bounded `canvas.node/connect/update/remove` call subset in an isolated Blob worker; CSP permits only the worker, not eval.
- **Regression test:** `./run.sh smoke-canvas-agent` applies a developer script, persists the shape and continues through promotion/artifact verification.
- **Caveat:** Loops, imports and arbitrary JavaScript are intentionally unsupported; use an operations program for generated batches.

### BUG-016 - Provider business command overrode explicit canvas intent

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-CAN-006` full-flow production smoke.
- **Symptom:** `cho tôi toàn bộ flow đi` drew shapes but chat replied that no requirement could be removed, and no canvas receipt outcome was recorded.
- **Trigger:** Mock provider interpreted `bộ` as a remove command while the application had already classified the message as an explicit draw.
- **Root cause:** Provider `remove_card` commands were processed before the application-owned canvas intent branch. Intent routing existed in planning but did not own orchestration priority.
- **Fix:** Only conversation intent may consume provider business-change commands; draw/edit/promote branches ignore conflicting provider commands and own their response lifecycle.
- **Regression test:** `./run.sh smoke-canvas-agent` and `./run.sh smoke-codex-canvas` require a blank kickoff, 18-node full flow and receipt-confirmed draw message.
- **Caveat:** New provider command families must be explicitly authorized by the routed application intent; schema validity alone is not permission.

### BUG-017 - Canvas receipt outran durable snapshot persistence

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-CAN-006` real Codex production smoke.
- **Symptom:** Chat receipt succeeded while SQLite still exposed zero canvas nodes; immediate selected edits or developer scripts could not find the just-created flow.
- **Trigger:** Renderer applied and acknowledged a Canvas Program before the 650 ms debounced canvas save fired.
- **Root cause:** In-memory tldraw read-back and durable CanvasDocument checkpoint were separate asynchronous paths, but chat treated the first as complete.
- **Fix:** CanvasWorkspace now persists the exact post-apply snapshot before sending the execution receipt. Main verifies request identity and operation/read-back counts before adding the final assistant outcome.
- **Regression test:** Both canvas-agent smokes require durable node/edge counts, selected edit persistence and developer script persistence before promotion.
- **Caveat:** High-frequency manual pointer edits remain debounced; the immediate durability rule applies to agent program transaction boundaries.

### BUG-018 - Animated camera fit was overwritten by the saved pre-animation frame

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-CAN-007` screenshot review.
- **Symptom:** A complete workflow existed but reopened/captured at 100% zoom, showing only its first nodes; a later feedback edit could also sit beyond the visible right edge.
- **Trigger:** Apply a large Canvas Program, animate `zoomToFit`, then save the snapshot immediately.
- **Root cause:** tldraw camera animation had not advanced when `getSnapshot()` ran, so the durable checkpoint stored the old camera and later synchronization restored it.
- **Fix:** Agent-owned camera fitting is immediate before checkpoint persistence. Small follow-up edits preserve the camera unless the selected result is outside the viewport, in which case the full scene is fit before saving.
- **Regression test:** `./run.sh smoke-canvas-agent` captures the full 18-node flow plus selected feedback; reviewed output fits the scene at 27% and keeps both feedback nodes visible.
- **Caveat:** User-triggered Fit remains animated because it is not immediately followed by an agent transaction checkpoint.

### BUG-019 - Decision completion entered a silent Delivery workspace

- **Status:** FIXED
- **Found:** 2026-07-23, manual custom discovery flow.
- **Symptom:** After selecting the third discovery/decision input, the cards disappeared and the agent stopped without exposing the next action; a generic `Tiếp tục` response did not explain canonical state.
- **Trigger:** Complete discovery, select any MVP option and enter `DELIVERY/ACTIVE`.
- **Root cause:** Active reasoning was correctly hidden after the state transition, but no Delivery checkpoint replaced it. The selection handler also wrote only a generic assistant sentence and did not record the user's selection as transcript evidence.
- **Fix:** Record the selected option as a user action, return ProductSpec counts and explicit next choices, render a persistent Delivery guide and make a generic `Tiếp tục` request report the same canonical status.
- **Regression test:** `./run.sh smoke-lifecycle` requires custom selection evidence, `deliveryGuideReady`, `transparentMessage` and a completed Delivery state.
- **Caveat:** ProductSpec remains a draft until a separate synthesis/promotion action; the guide does not pretend that choosing an option generated requirements.

### BUG-020 - Prototype intent fell through to the generic workflow planner

- **Status:** FIXED
- **Found:** 2026-07-23, manual request `Vẽ cho tôi prototype các màn hình`.
- **Symptom:** The agent announced a canvas draw but produced generic process boxes or no useful screen prototype.
- **Trigger:** Send an explicit prototype/wireframe request without listing every screen.
- **Root cause:** Workflow and prototype shared the same draw branch; requests without parsed `gồm ...` steps always used `genericFullWorkflow`.
- **Fix:** Add a distinct context-aware prototype planner, reserve mobile frame dimensions in scene layout, and render each semantic screen as a tldraw frame with editable low-fidelity child components and bound journey arrows.
- **Regression test:** canvas planner/layout unit tests require 3-5 `prototype-*` screen nodes; `./run.sh smoke-lifecycle` verifies 5 frames, 35 children and a prototype-specific durable receipt.
- **Caveat:** These are editable low-fidelity exploration frames, not strict Zalo Design System Figma output; promotion and guarded Figma generation remain separate approved steps.

### BUG-021 - Prototype furniture contaminated ProductSpec promotion

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-CAN-008` promotion-boundary review.
- **Symptom:** Scene headers and editable prototype child controls could be interpreted as business screens or requirements when promoting a canvas.
- **Trigger:** Add prototype furniture carrying stable semantic metadata, then synthesize ProductSpec from the full CanvasDocument.
- **Root cause:** Promotion selected every shape with a `semanticId`; presentation-only furniture also needs stable semantic IDs for reconciliation but intentionally has no business `nodeKind`.
- **Fix:** ProductSpec synthesis and promotion provenance now include only shapes carrying both `semanticId` and `nodeKind`. Furniture keeps `visualRole` metadata for inspection and rendering without entering business state.
- **Regression test:** `packages/canvas/src/index.test.ts` includes prototype header and child decoration fixtures and proves only semantic screens become requirements/screens.
- **Caveat:** New business node types must define an explicit `nodeKind`; a semantic ID alone is never promotion eligibility.

### BUG-022 - Agent-owned prototype selection opened an intrusive style panel

- **Status:** FIXED
- **Found:** 2026-07-23, final `P0-CAN-008` screenshot review.
- **Symptom:** Selecting an agent-generated prototype child opened tldraw's large default style panel over the right side of the canvas.
- **Trigger:** Select any editable agent-owned shape while reviewing or preparing selection feedback.
- **Root cause:** The custom UI exposed `DefaultStylePanel` for every single selection and did not distinguish freeform user shapes from generated scene furniture.
- **Fix:** The style panel is now available only for a selected user-owned shape; generated prototype selections retain handles, Focus and chat-context actions without obscuring the scene.
- **Regression test:** `./run.sh smoke-lifecycle` selects and edits an agent-owned prototype element; the reviewed 2880x1740 screenshot confirms the panel remains hidden.
- **Caveat:** Generated shapes remain editable through normal canvas transforms; richer generated-component styling belongs in a compact inspector follow-up.

Khi thêm bug, dùng mẫu này và không xóa bug cũ sau khi fix:

```md
### BUG-NNN - Tên ngắn

- **Status:** OPEN | FIXED | WONT_FIX
- **Found:** YYYY-MM-DD, task ID/commit
- **Symptom:** Người dùng/test nhìn thấy gì.
- **Trigger:** Điều kiện tái hiện tối thiểu.
- **Root cause:** Nguyên nhân kỹ thuật đã xác nhận; không đoán.
- **Fix:** Thay đổi nào xử lý nguyên nhân.
- **Regression test:** Test ID/file chứng minh lỗi không quay lại.
- **Caveat:** Điều còn chưa giải quyết hoặc scope liên quan.
```

## 6. Integration learnings

### Figma MCP source review - 2026-07-22

- Transport: MCP stdio; plugin bridge local WebSocket; no Figma REST token.
- Routing: explicit `sessionId`, client-aware routes và global active-session fallback.
- Capabilities: 98 registered tools; capability engine có timeout, compact retry/fallback và execution reports.
- DS tools: capture context, apply screen và audit adoption.
- Main gap: apply workflow hard-code form registration, mutates before complete strict decision, lacks lifecycle metadata/idempotency tool.
- Verification: `go test ./...` passed.
- Plugin verification after `BUG-001`: `bun run typecheck` passed; `bun test` has 253 pass/0 fail.
- Setup adapter starts or reuses the local HTTP/WebSocket runtime on port 1802, detects the built manifest/bundle and polls session health without requiring a Figma REST token.
- The import gate intentionally performs no Figma write. Session pinning, target page allowlist and DS context capture start only after the user runs the plugin.
- Live verification used the imported plugin against a public sandbox duplicate. MCP follower health, `get_pages` and bounded `capture_design_system_context` all succeeded with an explicit session ID.
- The public page exposed 6 paint styles, 3 text styles and 312 text nodes, but zero relevant components in the allowlisted subtree. The app stores only normalized counts/manifest data and switches to the clearly labeled synthetic fixture guard.
- Plugin connection is not permission: readiness requires an immutable hash over exact session/file/page identity plus cached DS context. A session/page mismatch removes ready state.
- MCP tool `plan_design_system_screens` is intentionally pure: it receives the host-approved target and normalized manifest, computes the full strict decision and plan hash, and has no `Runtime` parameter capable of issuing plugin writes.
- Lifecycle Figma apply uses plugin data key `za-pm-lifecycle`; root metadata owns idempotency/plan/target identity, screen metadata owns requirement traceability, and slot metadata owns resolved component role. Strict apply removes the root before returning an error if any component cannot be instantiated.

Khi tiếp tục spike Figma bridge, ghi lại:

- runtime/transport và version;
- capability/tool schema;
- auth/session assumptions;
- create/update/read-back behavior;
- metadata/idempotency support;
- timeout/error shape;
- sandbox restrictions;
- cách mock tương đương.

Không ghi token, cookie hoặc credential path.

## 7. Commands that are known to work

App commands đã chạy thành công:

```text
./run.sh             # verified 2026-07-22; Electron dev app opens
./run.sh setup       # verified 2026-07-22; installs/builds app, Go runtime and Figma plugin bundle
./run.sh reset       # verified by shared reset path 2026-07-22; resets then opens dev app
./run.sh typecheck   # verified 2026-07-23
./run.sh test        # verified 2026-07-23; 101 tests pass, 1 optional live test skipped
./run.sh build       # verified 2026-07-22
./run.sh smoke       # verified 2026-07-22; Mock provider + canvas
./run.sh smoke-recovery  # verified 2026-07-22; injected Jira failure + target-only UI retry
./run.sh smoke-reset # verified 2026-07-22; UI reset + three deterministic seeds + full flow
./run.sh smoke-canvas # verified 2026-07-22; drag/undo/delete boundary + invalid command + full flow
./run.sh smoke-ambiguity # verified 2026-07-22; NEEDS_USER_INPUT + no-write guard + resolved full flow
./run.sh smoke-canvas-agent  # verified 2026-07-23; draw + selected feedback + script + promotion + verified artifacts
./run.sh smoke-codex-canvas  # verified 2026-07-23; real Codex Canvas Program + topology guard + verified artifacts
PM_AGENT_SMOKE_PROVIDER=codex-local ./run.sh smoke  # verified 2026-07-22
PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke  # verified 2026-07-22; live allowlist + bounded DS capture + cache + UI
```

Command MCP đã chạy thành công:

```text
cd mcp-tool/za-talk-to-figma && go test ./...  # verified 2026-07-22
cd mcp-tool/za-talk-to-figma/plugin && bun run typecheck  # verified 2026-07-22
cd mcp-tool/za-talk-to-figma/plugin && bun test  # verified 2026-07-22; 253 tests pass
PM_AGENT_FIGMA_LIVE=1 pnpm exec vitest run packages/connectors/src/figma-mcp.live.test.ts  # verified 2026-07-22
```

Chỉ thêm command mới sau khi đã chạy thành công trong workspace hiện tại.

Mẫu:

```text
pnpm install       # verified YYYY-MM-DD
pnpm dev           # verified YYYY-MM-DD
pnpm test          # verified YYYY-MM-DD
pnpm typecheck     # verified YYYY-MM-DD
```

## 8. Failed approaches and why

- Sandboxed preload dạng ESM không chạy trong Electron 43 ở cấu hình này; dùng explicit CommonJS preload.
- Bundle provider SDK vào main kéo optional `ws/bufferutil` vào ESM output; externalize SDK như runtime dependencies.
- Dùng default tldraw CDN mâu thuẫn local-first CSP; dùng `@tldraw/assets` self-hosted.
- Clone toàn bộ `tldraw/tldraw` không cần cho SDK embedding; official package `tldraw` + `@tldraw/assets` nhỏ hơn, versioned và đúng quick-start. Chỉ clone monorepo nếu sửa upstream SDK hoặc chạy examples/source development.
- Fit một graph lớn bằng Dagre thuần tạo strip rộng hơn 4,000 canvas units và zoom 16%; giữ Dagre cho graph nhỏ/local edit, còn graph lớn cần main-journey wrapping và exception lanes.

Ghi lại những thử nghiệm tốn thời gian hoặc dễ lặp lại, ví dụ native SQLite packaging, Figma bridge mutation semantics, tldraw serialization hoặc Electron IPC issue. Mỗi entry cần nêu cách nhận biết và phương án thay thế đã chọn.

## 9. Session log

### 2026-07-22 - Planning baseline

- Đánh giá idea phù hợp track Workflow Automation Agent nhưng cần framing Zalo-specific.
- Chốt Figma làm integration/Design System guard; Jira/Zdoc mock sau.
- Tạo implementation roadmap, backlog, architecture, test/demo plan, decision log và project memory.
- Thêm `AGENTS.md` làm durable guidance cho mọi coding session.
- Review MCP Figma hiện có và chốt extension plan: generic recipe, strict preflight, lifecycle metadata/idempotency, read-back audit.
- Review official provider semantics và chốt native adapters + ProviderSegment/HandoffPackage.
- Bổ sung history/resume, one-canvas-per-thread, bidirectional chat-canvas và performance budgets.
- Next action: bắt đầu `P0-FND-001`; spike sớm native SQLite packaging, Codex App Server schema và chọn real API provider release slot.

### 2026-07-22 - First runnable desktop slice

- Bootstrap pnpm workspace với Electron Vite, React, TypeScript strict và Vitest.
- Thêm SQLite WAL history/messages/provider segments/canvas snapshots; mỗi thread hydrate đúng một tldraw canvas.
- Thêm typed preload IPC, Keychain-backed secret store và provider registry cho Mock, Codex App Server, OpenAI, Gemini, Anthropic.
- UI ba cột hỗ trợ history/search/archive, provider/model settings, chat, canvas selection context và chat-to-canvas commands.
- Self-host tldraw icons/fonts/translations bằng `@tldraw/assets`; canvas bundle lazy-load sau app shell.
- Fix white-window preload, Electron/bootstrap, provider SDK bundling, tldraw lifecycle/assets và Codex model/schema compatibility.
- Verification: typecheck, tests, build, Mock smoke và real Codex smoke pass; canvas screenshot reviewed.
- Next action: `P0-FND-002`, sau đó ProductSpec schemas/state machine; xin tldraw license trước production packaging.

### 2026-07-22 - Signature flow and Figma import gate

- Added canonical ProductSpec, action/approval/receipt schemas, deterministic meal-ordering and Zalo DS fixtures, package boundary checks and state-machine tests.
- Implemented the signature request `Bỏ payment khỏi MVP`: exact five-entity impact preview, immutable approval hashes, SQLite atomic commit to ProductSpec v2 and tldraw before/after projection.
- Resolved the Figma plugin rich paint serializer baseline; all plugin and Go tests pass.
- Added local Figma runtime lifecycle, typed Electron IPC, setup status modal, manifest reveal action and `./run.sh setup` for judge-friendly installation.
- Production smoke verifies preload, canvas, signature approval and the Figma import gate; visual review confirms no modal/canvas overlap at desktop demo viewport.
- Next action: user imports/runs `ZA Talk To Figma`; then finish `P0-FIG-001` with explicit session/page pinning, allowlist, DS context fingerprint/cache and read-back.

### 2026-07-22 - Live Figma read connection

- User imported and ran `ZA Talk To Figma`; runtime reported one connected public sandbox session.
- Added an official MCP SDK stdio follower adapter with typed runtime errors and live session/page validation before target pinning.
- Added immutable target hashes, one-active-target SQLite allowlist, bounded DS capture, deterministic normalized manifest fingerprints and cache reuse.
- Connected setup UI now separates plugin attachment, explicit sandbox permission and DS readiness. Green status requires all three.
- Live source evidence had styles/text but no relevant components, so the UI honestly reports `Synthetic fixture guard` instead of claiming live compliance.
- Fixed ESM packaging path resolution exposed by MCP SDK bundling; live production smoke passes end to end.
- Next action: implement `P0-FIG-002` generic semantic screen recipes, then strict zero-write preflight in `P0-FIG-003`.

### 2026-07-22 - Durable multi-artifact execution

- Added atomic approval + outbox persistence for immutable executable Figma/Jira/Zdoc plans.
- Added receipt-first connector orchestration, restart recovery, independent read-back verification and target-scoped retry.
- Added SQLite-backed Mock Figma parity so offline demo execution survives process restarts.
- Renderer now shows per-target attempts and verification status; the approval command performs the complete sync workflow.
- Verification: 56 tests, workspace typecheck, production build and strengthened smoke all pass; smoke requires exactly Figma/Jira/Zdoc to be verified and visible in the execution panel.
- Next action: inject a deterministic single-target failure and prove UI retry leaves already verified targets unchanged.

### 2026-07-22 - Partial failure recovery

- Added a dedicated recovery smoke mode that injects exactly one Mock Jira execution failure.
- UI exposes per-target failure and retry; after retry, attempts are Figma 1, Jira 2, Zdoc 1.
- The test proves Figma/Zdoc external IDs and attempts remain unchanged, then requires all three read-backs to verify.
- Signature screenshots now include preview, partial failure, final verified state and Figma setup readiness.
- Next action: implement deterministic demo reset and seeded external stores, then run the full path three times.

### 2026-07-22 - Deterministic demo reset

- Replaced first-run random seed data with fixture version 1, stable thread/message IDs and fixed timestamps.
- Added typed reset IPC, guarded UI control and `./run.sh reset`; provider profiles, credentials and Figma allowlist are preserved.
- History, canvas, lifecycle runs/outbox and SQLite mock artifacts are replaced atomically/cascade-safe.
- `./run.sh smoke-reset` resets three times, proves identical state and completes the verified signature flow.
- Next action: harden phase-specific reasoning contracts and malformed-output boundaries.

### 2026-07-22 - Phase-specific provider contract

- Added strict result schemas for discovery, decision, delivery and change phases without leaking provider SDK types.
- Mock provider emits deterministic questions/options/artifact readiness/change intent for the requested phase.
- Native provider output schemas are selected by phase; Mock and real Codex production smoke both pass.
- Agent Core validates untrusted output again and malformed/wrong-phase results leave canonical RunState unchanged.
- Next action: persist and render the discovery questions and decision options through a resumable orchestration loop.

### 2026-07-22 - Resumable Idea-to-decision core

- Added deterministic transitions from Idea Intake through Discovery to `WAITING_FOR_DECISION`.
- Reasoning checkpoints persist the validated phase result alongside canonical RunState in one SQLite transaction.
- Restart test restores both decision state and the exact recommended option; invalid phase/option transitions remain guarded.
- Seeded signature flow intentionally starts at Delivery so the change-sync demo remains one command away.
- Next action: normalize provider capabilities/events before wiring phase cards into UI.

### 2026-07-22 - Normalized provider events

- Added provider-owned capability declarations and SDK-free internal start/delta/result/usage/terminal events.
- Core accepts only contiguous, completed streams with exactly one phase-valid result; partial/cancel/error cannot mutate RunState.
- OpenAI/Gemini/Claude usage fields normalize into the same token event when available.
- Mock conformance tests and real Codex production smoke pass through the normalized boundary.
- Next action: persist capability snapshots and canonical handoff packages for guarded provider switching.

### 2026-07-22 - Safe provider handoff

- Added canonical handoff packages with ProductSpec, app-owned checkpoint, recent messages, pending actions and canvas presence only.
- Provider segments persist explicit capability snapshots and opaque remote references independently.
- Core blocks switches during turns or artifact execution; paid API segments require explicit UI/API confirmation.
- Persistence and production smoke prove thread, canvas and ProductSpec survive Mock -> API slot -> Mock switching without a paid call.
- Next action: expose resumable discovery questions and decision options in the lifecycle workspace.

### 2026-07-22 - Lifecycle decision workspace

- Thread-first Idea Intake now renders three structured clarification questions and persists chosen answers as chat evidence.
- The same provider produces 2-3 decision options with an explicit recommendation; selecting one advances canonical state to Delivery.
- Added a compact ProductSpec inspector with version/status/counts and selected entity context.
- Lifecycle smoke drives the full UI, switches away/back, saves clarification/decision screenshots and then confirms the signature change flow still passes.
- Next action: add explicit reject/cancel to the artifact approval panel.

### 2026-07-22 - Complete approval decisions

- Rejection is an immutable hashed decision, not a UI dismiss: actions become cancelled and no outbox row is created.
- ProductSpec remains v1 and run returns to Delivery, allowing a revised or repeated preview.
- `./run.sh smoke-reject` rejects through UI, proves no execution, then previews again and completes v2 verified sync.
- Change Impact and partial retry panels now satisfy their per-target status acceptance with reviewed screenshots.
- Next action: consolidate SQLite migration ownership and add missing history/event/mapping tables.

### 2026-07-22 - Versioned local persistence

- Added an idempotent migration ledger for turns, message parts, normalized provider events, canvas documents/checkpoints/patches and artifact mappings.
- Chat completion persists SDK-free events; failures/cancellation persist only sanitized terminal events.
- Canvas saves now create checkpoints while retaining the legacy snapshot column for upgrade compatibility.
- Clean/reopen tests and production smoke pass; atomic approval/outbox and canonical checkpoint handoff complete the transaction service acceptance.
- Next action: add cursor pagination, FTS5 search and 500-message performance coverage.

### 2026-07-22 - Scalable history and canvas ownership

- Added FTS5 transcript search, stable cursor message pages, bounded initial hydration and browser layout virtualization.
- 500-message test returns two disjoint pages under budget; renderer can prepend older pages on demand.
- Full offline restart restores phase/ProductSpec/messages/canvas/provider ref and safely replaces a stale opaque ref.
- Explicit CanvasDocument ownership test proves two threads keep two isolated documents while saves create checkpoints only.
- Next action: add typed canvas entity/edge projections and deterministic traceability arrows.

### 2026-07-22 - Guarded bidirectional canvas commands

- Added versioned entity/traceability-edge projection contracts with renderer-owned deterministic layout.
- Canonical tldraw Delete now emits a typed command to Agent Core, keeps ProductSpec unchanged and opens the same immutable impact/approval flow as chat.
- Drag and tldraw undo remain presentation-only; projection reconciliation is excluded from user undo history.
- Invalid canvas payloads and unsupported entity kinds are rejected before lifecycle state changes.
- `./run.sh smoke-canvas`, 80 unit/contract tests and workspace typecheck pass.
- Next action: implement explicit ambiguity handling for change requests that do not resolve to one target.

### 2026-07-22 - Explicit change ambiguity

- Added exact stable-ID, semantic title/alias and selected-entity resolution before deterministic impact traversal.
- Ambiguous remove requests persist `NEEDS_USER_INPUT` with candidate IDs and queue no preview, action or ProductSpec version.
- Clarification appears in chat beside the full canonical graph; a resolved follow-up resumes the same run and existing approval flow.
- Persistence restart tests and `./run.sh smoke-ambiguity` prove the no-write boundary and eventual verified v2 sync.
- Next action: audit the complete provider/history/canvas/connector critical test matrix.

### 2026-07-23 - Open canvas collaboration and developer skill

- Split tldraw into a freeform `Board` and optional ProductSpec-managed lifecycle filters; user/agent shapes remain visible and movable in every filter.
- Provider commands now support semantic process/decision/screen/note nodes and bound connections without arbitrary coordinates or JavaScript.
- Multi-selection and the contents spatially enclosed by a selected shape are normalized into a bounded chat context.
- Added a loopback Canvas Bridge with per-launch bearer token, validated command batches and a reusable `skills/pm-lifecycle-canvas` helper for Codex/Claude.
- Removed meal-ordering ProductSpec contamination from normal threads; the seeded fixture remains exclusive to the deterministic demo thread.
- Verification: workspace typecheck, 89 tests + 1 optional live skip, lifecycle/canvas production smokes and `./run.sh smoke-flow` pass; final screenshot reviewed at 1520x940.
- Next action: resume `P0-QA-001`, then add durable bridge command acknowledgement/idempotency under a follow-up hardening ticket.

### 2026-07-23 - Tldraw-first canvas agent runtime

- Removed the Board/Discover/Decide/Deliver/Change tab surface and implicit ProductSpec projection; every normal thread starts with one empty infinite tldraw canvas.
- Added typed Canvas Programs, normalized inspect/read-back context, atomic renderer apply, deterministic explicit-draw fallback and a no-eval virtual script worker.
- Chat and the developer bridge now share operations/script semantics; bridge program calls can wait for a renderer apply/read-back receipt.
- `Chốt flow này thành MVP` creates an immutable ProductSpec promotion preview. Confirmation commits v2, preflights Figma/Mock Jira/Mock Zdoc, asks for a second write approval and verifies all target read-backs.
- Real Codex smoke found and fixed nullable legacy-command normalization; provider output missing topology is labeled `provider_augmented` and completed deterministically.
- Verification: 93 tests + 1 optional live skip, workspace typecheck, `smoke-lifecycle`, `smoke-canvas-agent` and `smoke-codex-canvas` pass; signature remove-payment and connector verification remain green.
- Next action: continue `P0-QA-001` release-gate audit and package/rehearsal work.

### 2026-07-23 - Intent-gated and receipt-confirmed canvas collaboration

- Added application-owned Vietnamese intent routing so ordinary product conversation cannot mutate canvas and provider commands cannot change a draw/edit/promote request into a business action.
- Explicit full-flow requests use recent conversation context; the ride-booking demo produces 18 nodes, 19 semantic connections and key exception/retry branches.
- Vague edits without a selected or named target ask for clarification and preserve the snapshot. Selected edits receive normalized bounds and place additions near the target.
- Chat canvas programs carry request IDs. Renderer saves the post-apply snapshot before receipt; main verifies the request and read-back before writing exact node/connection outcomes.
- Recorded the explicit `Sync selection/region with chat` control and dirty-canvas awareness as follow-up scope.
- Verification: 97 tests + 1 optional live skip, workspace typecheck, Mock `smoke-canvas-agent` and real Codex `smoke-codex-canvas` pass through promotion and verified artifacts.
- Next action: resume `P0-QA-001` release-gate audit while keeping this bidirectional flow green.

### 2026-07-23 - Scene-aware visual canvas

- Confirmed the installed `tldraw-offline` skill, shared helper set and Codex agent config. Its useful transferable patterns are raw shape/binding inspection, stable IDs, viewport/selection context, high-level arrangement, screenshot review and lint-before-completion.
- Added renderer-owned scene layout with `@dagrejs/dagre`, collision avoidance against semantic and freeform shapes, stable reconciliation and topology-aware wrapped journeys for large flows.
- Canvas context now carries bindings, viewport, selected bounds, recent changes and lints. Overlap/dangling-edge errors prevent a false success receipt.
- Added distinct screen/process/decision/exception visual grammar, labeled semantic arrows, scene health/re-layout/fit controls and a compact seven-tool tldraw workbench. Single-shape style editing remains available; intrusive multi-selection style UI is hidden.
- Fixed camera/checkpoint ordering and conditionally refit offscreen feedback. Final 2880x1740 screenshot shows the complete ride flow, nearby exception paths and selected feedback at 27% without node overlap.
- Verification: 101 tests + 1 optional live skip, workspace typecheck, production build and full `./run.sh smoke-canvas-agent` pass through ProductSpec promotion and verified Figma/Mock Jira/Mock Zdoc artifacts.
- Next action: resume `P0-QA-001`; retain screenshot/lint checks in every canvas release gate.

### 2026-07-23 - Guided Delivery and editable canvas prototypes

- Discovery and decision cards now expose `Khác` with bounded free text; custom input is normalized by Agent Core and remains provider-independent.
- Selecting an MVP records the user action, reports exact ProductSpec status and opens a Delivery guide with user-flow, prototype and ProductSpec continuations.
- Explicit prototype requests no longer share the generic workflow fallback. Context-aware planning creates 3-5 semantic screens as movable tldraw frames with editable child controls and bound transitions.
- Prototype receipts distinguish screen frames from workflow nodes and only confirm after snapshot persistence plus read-back.
- Verification: 105 tests + 1 optional live skip, boundaries, workspace typecheck, production build and `./run.sh smoke-lifecycle` pass. Reviewed 2880x1740 output shows 5 non-overlapping meal-ordering frames, 35 child elements and a visible Delivery guide.
- Next action: continue `P0-QA-001` critical-matrix reconciliation and keep the custom lifecycle/prototype smoke green.

### 2026-07-23 - Canvas co-creation and prototype scene transformation

- Replaced repeated generic wireframe rows with five distinct editable meal-ordering screens, scene framing, locked-scope context and a compact two-row journey that fits at 47%.
- Added Overview, Focus selection, manual-dirty status and explicit Sync. Sync checkpoints the exact tldraw state, sends bounded canvas/selection context into chat and never mutates ProductSpec implicitly.
- Added visible reasoning, apply, checkpoint and read-back activity so canvas work is no longer a black box. Selection feedback can prefill chat from the selected canvas element.
- Separated scene furniture from promotable business nodes and hid the intrusive style panel for generated prototype selections.
- Verification: 106 tests + 1 optional live skip, workspace typecheck, production build and full `./run.sh smoke-lifecycle` pass. Smoke proves custom decision -> five-screen prototype -> pointer edit -> dirty state -> selected feedback -> Sync receipt -> unchanged ProductSpec -> verified artifact path; final 2880x1740 screenshot reviewed.
- Next action: continue `P0-QA-001` critical-matrix reconciliation and retain the two-way canvas smoke as a release gate.

## 10. End-of-session checklist

- [ ] Cập nhật active/completed task và evidence trong `BACKLOG.md`.
- [ ] Ghi bug/fix/regression test mới.
- [ ] Ghi integration learning hoặc failed approach mới.
- [ ] Ghi command mới chỉ sau khi verify.
- [ ] Cập nhật blocker/risk và decision nếu contract thay đổi.
- [ ] Chỉ để một next action rõ ràng cho phiên sau.
