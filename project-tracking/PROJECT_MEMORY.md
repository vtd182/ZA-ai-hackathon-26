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

- **Date:** 2026-07-29
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
- **Completed task:** `P0-CAN-009` creative conversation, provider-authored native scenes and typed CanvasDiff sync.
- **Completed task:** `P0-AGT-006` thread-specific decision-to-ProductSpec synthesis with atomic empty-draft replacement.
- **Completed task:** `P0-FIG-007` allowlisted same-file ZDS instance catalog, strict clone/apply and instance-backed read-back.
- **Completed task:** `P0-FIG-008` provider-owned product-grade Figma synthesis with live ZDS capture, guarded creative execution and visual review.
- **Completed task:** `P0-CRE-001` Creative Studio conversation and agentic Figma craft.
- **Completed task:** `P0-FIG-010` Product-craft layout guard and skill import direction.
- **Completed task:** `P0-PKG-001` Package-safe global skill packs.
- **Current slice (2026-07-26 demo-hardening):** (1) `skill-installer.ts` auto-installs the guarded `pm-lifecycle-canvas` skill into `~/.claude/skills` on launch (tldraw-style, idempotent hash marker, never clobbers a foreign same-named skill), making external Claude/Codex able to draw on the live canvas; SKILL.md now uses an absolute `$HOME` helper path (portable). See `docs/SKILL_PACKAGING.md`. (2) All HTTP providers (OpenAI/Gemini/Anthropic) now run under `withProviderDeadline` (race-based timeout + forwarded cancel); Gemini finally receives the abort signal — a stalled provider can no longer hold the single active-turn slot. (3) UI polish: token-based design system, non-overlapping canvas overlays (scene-bar pill top-right), gradient CTAs/chat bubbles, canvas dot-grid + card accent stripe, and an "AI Canvas" header chip showing the Dev Canvas Bridge is live (IPC `dev-bridge:status`). (4) Mock route turns clear `result.commands` (no offline canvas/phase mutation on conversation). Regression tests: `skill-installer.test.ts` (5), reasoning route-command test. Full suite 174 pass/2 skip, typecheck clean. Demo pitch/script in `docs/PITCH.md`.
- **Current slice (2026-07-29 AgentRouter):** AgentRouter now follows the China docs endpoint family, not the `co.agentrouter.org` mirror. The app exposes the three account models (`gpt-5.6-sol`, `claude-opus-4-8`, `claude-opus-5`) in a global provider model selector. Raw SDK calls hit AgentRouter WAF (`unauthorized client detected`), so the `agentrouter` adapter uses a temporary Codex app-server/Responses bridge with `https://agentrouter.org/v1` and `AGENT_ROUTER_TOKEN`. Live contract evidence: `PM_AGENT_AGENTROUTER_LIVE=1 ... vitest ... -t 'runs AgentRouter'` passed for `gpt-5.6-sol` in 17.6s. Manual tests for both Claude models through the same bridge reconnected repeatedly and ended with upstream high-demand errors.
- **Current slice (2026-07-29 release):** GitHub Release pipeline now prepares one canonical packaged resource tree containing skill packs plus minimal Figma MCP/plugin runtime. Electron installers embed `resources/figma-runtime`. CI builds the OS-independent Figma plugin once, reuses it in macOS/Windows jobs, and attaches `za-talk-to-figma-plugin.zip` plus OS-specific `za-talk-to-figma-runtime-<os>-<arch>.zip` bundles. Local `./run.sh dist` rebuilt Go + plugin and produced `apps/desktop/release/DualMind-0.1.2-arm64.dmg` plus `.dmg.blockmap` with no lock file.
- **Current slice (2026-07-29 no-ZDS Figma):** Figma setup now has explicit `Dùng ZDS` and `Không dùng ZDS` paths. ZDS mode keeps the selected Page as guarded component source and writes to managed artifact Pages. No-ZDS mode marks the selected Page as a live free-creative destination, uses a live-primitives manifest with no fake component keys, plans with `pageStrategy: use_target_page`, and the plugin appends artifact roots directly on that Page without renaming it. Explicit no-ZDS never silently degrades to Mock Figma; stale target retries reprepare a Figma-only approval and preserve already verified Jira/Zdoc. No-ZDS is now adaptive-surface design: web/admin/dashboard/landing/tablet/mobile are chosen from ProductSpec, ZDS count may be 0, and desktop product frames are valid audit targets.
- **Current slice (2026-07-30 product sharpening):** `project-tracking/PRODUCT_SHARPENING_AUDIT.md` is the coordination brief for making the product value crisp before further code changes. It defines the agent as a governed co-creation workspace, clarifies ProductSpec as confirmed business truth, separates clear-input and ambiguous-input paths, names the target demo narrative and breaks follow-up work into `P0-SHARP-001..009`.
- **Current slice update (2026-07-30 AgentRouter bridge):** AgentRouter should not mutate or depend on the user's personal `~/.codex`. The app now supports an app-managed persistent AgentRouter `CODEX_HOME` under userData via `PM_AGENT_AGENTROUTER_CODEX_HOME`, so AgentRouter chat can persist `remoteRef` and resume Codex app-server threads. Figma craft on AgentRouter threads uses the same managed Codex home and injects `AGENT_ROUTER_TOKEN` through env; config TOML stores only `env_key`, never the token. Verification: `./run.sh typecheck` and `pnpm exec vitest run packages/reasoning/src/index.test.ts` pass.
- **Current slice update (2026-07-30 clear brief):** Clear, high-signal product briefs now skip generic guided discovery. `extractProductBrief` detects product surface/users/scope/out-of-scope/risk, `synthesizeProductSpecFromBrief` replaces an empty draft with a reviewable Draft ProductSpec, and chat returns concrete next actions (`/canvas flow`, `/canvas prototype`, `/figma prepare`). UI labels Draft ProductSpec as source-of-truth state and shows `FINDING-PRODUCT-SURFACE` for web/admin/no-ZDS briefs because ProductSpec schema v1 still stores only `mini_app|oa|bot` in `idea.productType`. Verification: `./run.sh typecheck`, `./run.sh test`, and `./run.sh build` pass.
- **Current slice update (2026-07-30 context budgeter):** Reasoning prompts now use task-scoped context packs. Normal `route-chat` sends only a compact transcript plus selection summary and explicitly skips the full canvas dump; `canvas-sync`, `canvas-draw` and `canvas-edit` attach capped canvas/diff detail; `figma-blueprint` stays ProductSpec-first. This keeps AgentRouter/Codex threads usable for chat and Figma blueprint generation without sending every canvas/skill context each turn. Figma MCP/plugin execution is still owned by Agent Core approval + read-back, not by the provider. Verification: `pnpm exec vitest run packages/reasoning/src/index.test.ts`, `./run.sh typecheck`, `./run.sh test`, `./run.sh build`, and `git diff --check` pass.
- **Current slice update (2026-07-30 ProductSpec confirmation):** Draft ProductSpec now requires explicit confirmation before artifact planning. `/spec confirm` and the Delivery UI button persist `productSpec.status = approved` on the current ProductSpec version via `LifecycleStore.updateCurrentProductSpec`. `prepareArtifactsForThread` and `/figma prepare` block draft specs with an actionable message, keeping ProductSpec confirmation separate from external write approval. Verification: `pnpm exec vitest run packages/persistence/src/lifecycle-store.test.ts apps/desktop/src/main/slash-commands.test.ts`, `./run.sh typecheck`, `./run.sh test`, and `./run.sh build` pass.
- **Current slice update (2026-07-30 ArtifactBrief):** Figma artifact planning now creates a canonical `ArtifactBrief` from ProductSpec + Figma context before blueprint/plan generation. It records mode (`zds_strict`, `zds_reference`, `free_adaptive`, `mock`), surface, fidelity, output policy, DS policy, verification policy and the ProductSpec payload hash. The brief is stored in the approved action payload and sent to the Figma craft worker; no-ZDS/free briefs force zero component roles so providers/workers do not drift back to ZDS/mobile assumptions. Verification: `pnpm exec vitest run packages/domain/src/artifact-brief.test.ts apps/desktop/src/main/figma-design-worker.test.ts`, `./run.sh typecheck`, `./run.sh test`, `./run.sh build`, and `git diff --check` pass.
- **Design note:** natural-language Figma approval (`artifact/approve`, BUG-033) is intentionally kept; `artifactPlanPending` already requires `WAITING_FOR_APPROVAL` + no `pendingIntent` + all actions `pending_approval`, so it cannot fire on a change preview and only executes a payload-hash-bound plan the user just prepared.
- **Last known repository state:** Runnable Electron app with Studio/lifecycle display separation, one blank-first infinite canvas per thread, typed Canvas Programs, Mock/Codex provider paths, thread-specific ProductSpec synthesis, editable consent-first prototypes, exact-selection Sync/refine, deterministic impact preview, Markdown PRD export and approved strict live Figma ZDS write/read-back verification.
- **Known blockers:** cần trial/commercial/hobby tldraw license key trước production packaging; OpenAI/Gemini/Anthropic adapters chưa thể live-test khi không có API key; GitHub Release workflow is being validated by the `v0.1.2` tag push. `v0.1.1` exposed a Windows CI plugin-build mismatch and should be ignored.
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
- MCP hiện có 104 tools, stdio transport, local WebSocket plugin bridge, multi-session routing và typed error contract.
- Existing DS apply đang hard-code registration form slots và cho phép primitive fallback; strict hackathon flow cần generic recipe + zero-write preflight.
- Pin explicit Figma `sessionId`; không dựa vào global active route.
- The public framework duplicate is an allowlisted same-file ZDS catalog: most DS definitions are exposed as copied `INSTANCE` nodes rather than local `COMPONENT` nodes.
- Strict plans bind semantic roles to exact source instance/page IDs, clone those instances, and verify actual `INSTANCE` type plus immutable source binding on read-back.
- The selected Figma Page is a guarded component source, not an artifact destination. Recipe-versioned artifacts live on a dedicated `PM · <Product> · vN` Page; read-back records and audits `artifactPageId` and `artifactPageName`.
- On Figma Starter's three-Page limit, create is attempted first. Only a same-product Page containing exclusively PM Lifecycle artifact roots may be reused; prior versions remain as sibling sections and user-authored nodes block reuse.
- A plugin reconnect changes the immutable session/target hash. Retry must re-preflight and ask approval for a new Figma action while preserving already verified Jira/Zdoc actions and the old audit trail.
- Fixture/free-mode fallback remains available only when neither local components nor usable same-file instances are captured; it must stay visibly labeled and must not be pitched as strict ZDS compliance.

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

### BUG-023 - Decision completed with a placeholder ProductSpec

- **Status:** FIXED
- **Found:** 2026-07-23, non-demo lifecycle-to-artifact audit.
- **Symptom:** A normal thread could reach Delivery after selecting an option while its ProductSpec still had zero requirements/screens/stories, so canvas/Figma output depended on fixture or later promotion.
- **Trigger:** Create a blank thread, answer discovery questions and select any decision option.
- **Root cause:** The decision transition persisted phase/status and transcript evidence but never synthesized and committed business entities from the clarified idea.
- **Fix:** Added deterministic domain-aware ProductSpec synthesis and an atomic repository method that replaces only an untouched empty v1 draft.
- **Regression test:** `product-spec-synthesis.test.ts`, `lifecycle-store.test.ts` and `./run.sh smoke-lifecycle` verify traceability, thread specificity and preservation across canvas Sync.
- **Caveat:** The synthesizer is an MVP baseline, not a replacement for later provider-assisted enrichment; every generated spec still passes domain invariants before persistence.

### BUG-024 - Go and TypeScript disagreed on the approved Figma plan hash

- **Status:** FIXED
- **Found:** 2026-07-23, app-level live Figma smoke.
- **Symptom:** Target pinning and preflight succeeded, but the approved live action failed with `Approved action does not cover this immutable Figma plan`.
- **Trigger:** Prepare a live plan in Go, persist its hash, then execute through the TypeScript connector policy.
- **Root cause:** Go hashed struct-field JSON order while TypeScript recursively sorted object keys before SHA-256, producing different hashes for the same semantic plan.
- **Fix:** Go now converts the resolved plan to generic JSON before hashing, matching the cross-runtime canonical key order; a fixed canonical hash regression test locks the contract.
- **Regression test:** Go suite, live adapter test and `PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke` pass with a non-mock Figma receipt.
- **Caveat:** Any future hash-bearing cross-language payload must use the same canonical JSON contract before approval.

### BUG-025 - Deep Figma page scans starved live artifact apply

- **Status:** FIXED
- **Found:** 2026-07-23, repeated live demo runs on the public framework file.
- **Symptom:** Design-system capture or artifact apply timed out after the page accumulated generated artifacts.
- **Trigger:** Capture and then apply on a large public page containing a deep source tree and several previous lifecycle artifacts.
- **Root cause:** Capture budgets allowed up to 1,500 visited nodes per scan, while lifecycle idempotency lookup traversed up to 5,000 descendants even though generated roots are direct page children.
- **Fix:** Bounded component/text discovery to short demo budgets, persisted an explicit labeled fallback when capture cannot finish, and changed artifact lookup to direct page children.
- **Regression test:** 256 plugin tests, Go suite, live adapter test completes in about two seconds, and app live smoke verifies Figma/Jira/Zdoc plus Markdown.
- **Caveat:** A dedicated compact DS source page remains preferable for strict component-map capture; fallback does not imply strict Zalo DS compliance.

### BUG-026 - Copied ZDS catalog was misclassified as empty

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-FIG-007` live inspection.
- **Symptom:** The app labeled the public Zalo Mini App Framework page as synthetic fallback even though the page visibly contained the ZDS controls needed by the demo.
- **Trigger:** Capture a page where external ZDS components were copied in as `INSTANCE` nodes and no matching local `COMPONENT` definitions existed in the bounded subtree.
- **Root cause:** Capture treated only local component definitions as a usable design-system map and ignored copied instances, so a valid same-file catalog produced a false zero-component result.
- **Fix:** Added bounded instance discovery, semantic role normalization, light/default variant scoring, typed same-file bindings, strict cloning, text overrides and independent instance-backed read-back.
- **Regression test:** connector normalization tests, plugin discovery/apply tests, Go strict binding tests and `PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke` pass; live node `449:16909` uses light/default ZDS instances.
- **Caveat:** The binding is intentionally page-scoped. Moving or deleting source catalog instances invalidates preflight/read-back and requires recapture.

### BUG-027 - Reasoning activity leaked across history threads

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-UX-001`.
- **Symptom:** Switching from a thread with a running provider turn made every thread show the same pending state and allowed confusing cross-thread UI updates.
- **Trigger:** Start a slow turn in thread A, then open thread B before it completes.
- **Root cause:** Renderer activity was one global boolean and async completion wrote through a stale `activeThread` closure. Main only rejected another turn for the same thread.
- **Fix:** Track the running thread ID, guard async state application with the currently requested thread, show pending only on the owner thread and enforce one global provider turn in main.
- **Regression test:** `apps/desktop/src/main/active-turns.test.ts` covers empty, same-thread and cross-thread locking; workspace typecheck and non-socket test suite pass.
- **Caveat:** A running turn is process-local by design; interrupted turns are recovered from persisted terminal/checkpoint state after restart.

### BUG-028 - Generic canvas fallback duplicated context and stacked scenes

- **Status:** FIXED
- **Found:** 2026-07-23, `P0-UX-001` reminder-backup review.
- **Symptom:** Reminder-backup requests produced a generic flow, the first node repeated transcript text, prototypes contained placeholder rows and subsequent draws overlapped old agent layers.
- **Trigger:** Discuss a reminder-backup idea, request the full flow, then request a prototype on the same canvas.
- **Root cause:** The deterministic planner had no backup-reminder domain, generic start labels embedded recent messages, and explicit redraws only upserted new IDs without removing the previous scene.
- **Fix:** Added a 17-node reminder-backup workflow, five detailed prototype screens, duplicate filtering and type-aware replace-scene operations. Executor deletes an old scene of the same type before creating new furniture/frames while preserving complementary workflow/prototype scenes.
- **Regression test:** `packages/canvas/src/index.test.ts` checks domain nodes, unique labels, detailed screens and old-scene deletion; ProductSpec synthesis has a matching five-screen regression test.
- **Caveat:** Visual screenshot review still requires an unrestricted Electron run; semantic/layout tests do not replace human review.

### BUG-029 - Figma output repeated low-fidelity wireframe slots

- **Status:** FIXED
- **Found:** 2026-07-24, `P0-FIG-008`.
- **Symptom:** Approved Figma output looked like repeated generic phone wireframes and could not serve as a credible near-product design reference.
- **Trigger:** Generate a reminder-backup artifact from a valid ProductSpec and compare its screens, hierarchy and transitions.
- **Root cause:** The artifact plan described only a vertical list of semantic component slots. The compositor owned layout and copied the same placeholder structure to every screen; prototype edges and concept coverage were trusted from root metadata instead of the rendered design.
- **Fix:** Added a cross-runtime Design Blueprint with art direction, archetypes and structured product content; added kind-specific product composition, strict ZDS instance integration and real Figma navigation reactions on a dedicated output Page.
- **Regression test:** reminder-backup blueprint tests lock five distinct archetypes and domain content; plugin tests delete rendered design nodes/reactions and prove read-back loses the corresponding concept, section and edge; TypeScript and Go audits reject those mismatches.
- **Caveat:** Automated structure/audit tests cannot certify visual taste. Close `P0-FIG-008` only after the newly generated live Page is reviewed at normal Figma zoom; future provider-assisted art-direction enrichment must still produce the validated Blueprint contract.

### BUG-030 - Interleaved provider edges executed before their nodes

- **Status:** FIXED
- **Found:** 2026-07-24, `P0-CAN-009` real Codex canvas smoke.
- **Symptom:** A valid selected-node edit rendered only 7 of 10 proposed operations and failed durable read-back.
- **Trigger:** Let a provider interleave `create_node` and `connect` operations where an edge appears before one of its endpoint nodes.
- **Root cause:** The renderer executed provider array order literally, so tldraw rejected connections whose endpoints had not been created yet.
- **Fix:** Execute deletes first, then all node creation, updates and finally all connections while preserving the immutable validated program for receipt comparison.
- **Regression test:** real `./run.sh smoke-codex-canvas` now applies every provider-created feedback node and receives `Đã cập nhật vùng canvas đã chọn` after read-back.
- **Caveat:** A connection to a genuinely absent semantic ID still fails verification by design.

### BUG-031 - Conversation-only turns carried the full creative schema

- **Status:** FIXED
- **Found:** 2026-07-24, `P0-CAN-009` real Codex canvas smoke.
- **Symptom:** An ordinary idea discussion could spend the full 120-second provider timeout even though no canvas mutation was requested.
- **Trigger:** Send a normal product idea through Codex while the output schema still requires the complete rich Canvas Program contract.
- **Root cause:** Chat prose and creative scene generation shared one large structured-output schema.
- **Fix:** Classify provider requests into lightweight conversation turns and creative canvas turns. Only explicit draw/edit, selection or CanvasDiff context includes the rich canvas schema; ambiguous edits return a fast app-owned clarification.
- **Regression test:** domain contract test covers the lean schema; real Codex smoke completes normal discussion, leaves canvas blank, then independently produces a provider-authored scene.
- **Caveat:** Rich Codex scenes still take roughly 45-105 seconds in observed runs; keep Mock/Offline ready for a time-boxed stage demo.

### BUG-032 - Long provider descriptions overlapped workflow lanes

- **Status:** FIXED
- **Found:** 2026-07-24, `P0-CAN-009` live screenshot review.
- **Symptom:** Long provider-authored card descriptions crossed the lane label near the bottom of a workflow node.
- **Trigger:** Render a workflow node with a description substantially longer than deterministic fallback copy.
- **Root cause:** Rich card height growth was capped at 72 pixels regardless of wrapped line count.
- **Fix:** Estimate wrapped lines at the renderer width and allow up to 220 pixels of additional height; layout and collision handling consume the same dimensions.
- **Regression test:** workspace typecheck/tests and `./run.sh smoke-flow` pass after the geometry change; screenshot review confirms description and lane occupy separate regions.
- **Caveat:** Renderer layout protects readability, but visual taste still requires screenshot review for each primary demo scenario.

### BUG-033 - Natural Figma approval produced promises instead of execution

- **Status:** FIXED
- **Found:** 2026-07-24, `P0-FIG-008`.
- **Symptom:** After the agent described a Figma export, messages such as “hãy làm đi” produced another explanation but no immutable plan, approval card or external write.
- **Trigger:** Confirm a Figma action through the chat composer instead of the dedicated artifact button.
- **Root cause:** Every chat message went to the reasoning provider; natural artifact intent was never routed to the app-owned artifact orchestrator.
- **Fix:** Added bounded natural-language artifact intent classification. Explicit creation prepares the immutable plan; contextual confirmation approves only an already-persisted pending plan; ordinary prototype/canvas requests stay with the canvas path.
- **Regression test:** `apps/desktop/src/main/artifact-intent.test.ts` covers explicit Figma creation, contextual approval, ordinary product chat and prototype non-hijacking. `./run.sh smoke-lifecycle` verifies the full prototype path still runs.
- **Caveat:** External write still requires a persisted payload-hash approval. A first request may prepare the plan; execution starts only after the approval card or a subsequent unambiguous confirmation.

### BUG-034 - Figma artifact work had mismatched timeouts and duplicate full-document reads

- **Status:** FIXED
- **Found:** 2026-07-24, `P0-FIG-008`.
- **Symptom:** Figma creation could appear frozen, exceed the bridge timeout, and spend extra time scanning the document immediately after apply.
- **Trigger:** Apply a multi-screen lifecycle artifact through the live MCP/plugin path.
- **Root cause:** Desktop, capability registry and plugin bridge used different timeout budgets; apply emitted no heartbeat; the plugin returned a full read snapshot and Agent Core then performed a second independent full scan.
- **Fix:** Replaced the fixed budget with an operation-aware client timeout: five-minute minimum plus five seconds per estimated operation, capped at 30 minutes. The bridge/capability ceiling is 30 minutes, heartbeat inactivity is five minutes and root-targeted read-back is three minutes. Apply emits per-screen heartbeats, the renderer shows stage/elapsed telemetry, the lightweight receipt avoids a duplicate traversal and target validation is cached for 10 seconds.
- **Regression test:** workspace typecheck and 132 tests pass; timeout bound tests, plugin lifecycle apply/idempotency/root-read tests, full Go suite, rebuilt runtime/plugin, `./run.sh smoke` and `./run.sh smoke-lifecycle` pass.
- **Caveat:** `PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke` on 2026-07-24 found no connected plugin session (`targetAllowed=false`), so this slice still needs a connected-session live timing and normal-zoom visual review before `P0-FIG-008` can close.

### BUG-035 - Kick-off Discovery promised choices but persisted no checkpoint

- **Status:** FIXED
- **Found:** 2026-07-24, exported ride-booking thread review.
- **Symptom:** `Kick off cho ý tưởng đặt xe` received Discovery prose promising choices, but no choices appeared. A three-line free-form answer then received the unrelated canvas message asking the user to select a node.
- **Trigger:** Start a thread with spaced `kick off`, then answer with content containing `tài xế đối tác` or `theo dõi chuyến`.
- **Root cause:** The lifecycle transition only recognized the single token `kickoff`, leaving RunState at `IDEA_INTAKE` with no reasoning checkpoint. Separately, accent normalization turned `đối tác` and `theo dõi` into text containing the overly broad canvas edit keyword `doi`.
- **Fix:** Every provider response now carries a typed semantic intent. `discovery` persists the checkpoint, while `conversation` cannot mutate canvas. Structured three-line answers still advance the visible Discovery checkpoint through the same validated boundary.
- **Regression test:** provider contract/mock tests cover Discovery versus conversation; `./run.sh smoke-lifecycle` reports 3 Discovery questions and 3 Decision options; real `./run.sh smoke-codex-canvas` keeps ordinary discussion blank-first.
- **Caveat:** Free-form auto-advance intentionally requires one structured line per visible question; partial or unstructured discussion remains provider-owned conversation instead of guessing business decisions.

### BUG-036 - Application regex duplicated LLM semantic intent

- **Status:** FIXED
- **Found:** 2026-07-24, follow-up architecture review of `BUG-035`.
- **Symptom:** Correct Vietnamese product language could trigger unrelated canvas or lifecycle actions, and each new wording required another keyword exception.
- **Trigger:** Accent-fold or keyword-match natural language before calling the reasoning provider.
- **Root cause:** Application code owned both semantic interpretation and execution policy. Accent folding destroyed distinctions such as `đổi`, `đối` and `dõi`, while a large creative schema could not be sent to every ordinary turn without latency cost.
- **Fix:** Added provider-neutral typed intents (`conversation`, `discovery`, `draw`, `edit`, `promote`, `change`, `artifact`). Natural turns first use a lightweight route schema; only `draw/edit` load the rich creative schema. Slash canvas commands go directly to creative mode. Agent Core requires a selected or uniquely resolved target for edit and keeps all approval guards.
- **Regression test:** domain/reasoning/canvas contracts verify typed routing and accent-safe target resolution; Mock `./run.sh smoke-flow`, `./run.sh smoke-lifecycle` and real `./run.sh smoke-codex-canvas` pass. The real provider produced a 20-node flow and an 11-operation selected edit.
- **Caveat:** Natural `draw/edit` uses two provider turns and may be slower than `/canvas flow|prototype`; the real-provider smoke budget accounts for both bounded turns.

### BUG-037 - Live Figma silently degraded to a synthetic wireframe path

- **Status:** FIXED
- **Found:** 2026-07-24, live `P0-FIG-008` visual review.
- **Symptom:** Figma appeared to generate in 1-2 seconds, looked generic and later tried to import `fixture/*` component keys.
- **Root cause:** Live DS capture failure was persisted as a fixture fallback and the execution context converted it into a free-mode live write.
- **Fix:** Live strict preparation now blocks without real bindings. Capture keeps copied same-file instances even when supplemental component/style/variable APIs fail.
- **Regression test:** live capture returned 190 instances, 25 semantic bindings, 9 tokens and `fallbackReason: null`; strict apply/read-back verified 16 instance-backed controls.
- **Caveat:** Mock Figma remains a labeled offline rehearsal path, not visual quality evidence.

### BUG-038 - Figma approval and Go plan hash disagreed across runtimes

- **Status:** FIXED
- **Found:** 2026-07-24, connected Figma approval.
- **Symptom:** Approved apply failed immediately with `Approved action does not cover this immutable Figma plan`.
- **Root cause:** execution reran preflight, and TypeScript recomputed a Go-owned hash using different JSON escaping semantics.
- **Fix:** Persist the exact prepared preflight in the approved payload. Agent Core validates the payload hash and matching connector plan hash; Go recomputes its own hash before write.
- **Regression test:** prepared-preflight execution test proves zero second preflight; live approved action completed and verified.
- **Caveat:** Connector-native hashes are opaque outside their adapter.

### BUG-039 - Long Figma apply was cut by a hidden follower deadline

- **Status:** FIXED
- **Found:** 2026-07-24, first creative live apply.
- **Symptom:** a 9-minute approved budget still failed near 35 seconds.
- **Root cause:** the follower used a fixed 35-second `http.Client.Timeout`.
- **Fix:** follower calls inherit MCP/caller context deadlines; health ping keeps its own 2-second bound. Creative element count contributes to estimated operations.
- **Regression test:** `TestFollowerUsesCallerDeadlineInsteadOfFixedHTTPTimeout`, Go suite and connected apply.
- **Caveat:** total apply remains bounded to 30 minutes.

### BUG-040 - Figma async lookup timed out for nodes already loaded locally

- **Status:** FIXED
- **Found:** 2026-07-24, live capture and apply recovery.
- **Symptom:** `get_node_context` and apply returned Figma's 10-second connection error although the file/page was visibly open.
- **Root cause:** plugin reads always called network-backed `getNodeByIdAsync`; artifact lookup also loaded every page before checking the current one.
- **Fix:** read and lifecycle handlers resolve loaded page trees first, scan current page first and skip unavailable non-current pages. Supplemental capture failures no longer erase a successful instance catalog.
- **Regression test:** direct live page read completed in 0.35s and full 102KB DS capture in 1.4s.
- **Caveat:** genuinely unloaded remote pages may still require Figma connectivity.

### BUG-041 - Creative reruns collided with stale idempotency and page limits

- **Status:** FIXED
- **Found:** 2026-07-24, repeated live visual tests in a Figma Free file.
- **Symptom:** different blueprints shared `creative-v1`; a failed write left an empty agent page and all free page slots were consumed.
- **Root cause:** idempotency did not include creative content, and timeout could outlive the caller after creating a page.
- **Fix:** idempotency includes the blueprint hash. An approved `create_or_recover_incomplete` strategy may reuse only a same-spec page with exactly one agent-owned root and no screen metadata.
- **Regression test:** plugin recovery test and live run reused the incomplete page, then verified root `489:16542`.
- **Caveat:** completed artifacts and user pages are never replaced automatically.

### BUG-042 - Compact ZDS messages could clip long provider copy

- **Status:** FIXED
- **Found:** 2026-07-24, 2248x1024 live artifact bitmap review.
- **Symptom:** long status/error text was clipped inside compact copied instances.
- **Root cause:** the design prompt had no control-specific copy budget.
- **Fix:** provider policy and plan validation limit only app-header, button and status/error control copy; supporting prose stays unconstrained in primitive composition. The deterministic fallback compacts its own control copy at word boundaries while preserving Vietnamese text.
- **Regression test:** artifact-plan content-fit rejects a 65-character provider message; reasoning fallback tests enforce 32-character headers and 64-character status messages; `./run.sh smoke-flow` verifies the promoted 17-screen journey.
- **Caveat:** final visual review remains required because structural verification cannot judge taste.

### BUG-043 - Generated Figma Page could replace the ZDS source

- **Status:** FIXED
- **Found:** 2026-07-24, post-`P0-FIG-008` real prepare.
- **Symptom:** `lifecycle:prepare-artifacts` returned one `MISSING_COMPONENT_ROLE` issue for nearly every generated slot.
- **Trigger:** view or re-allow a generated `PM · ...` Page after a successful artifact run, then prepare another kickoff package.
- **Root cause:** source allowlisting and the currently visible Page were treated as the same state. Local nodes without semantic hints still made the captured manifest appear live, so failure was delayed until slot preflight.
- **Fix:** immutable target verification and plugin execution now resolve the allowlisted source Page by ID without requiring it to stay visible. Explicit pinning still requires the visible Page; managed output Pages are rejected, rebind remains available, unmapped components do not count as live and required roles are checked before provider planning.
- **Regression test:** Figma adapter verifies a source while an output Page is current; plugin applies and reads back from the non-current source; source-policy and unmapped-manifest tests cover rejection. Live app prepare returned a valid 4-screen/45-layer immutable preflight after plugin reload. Full evidence: 148 workspace tests, 263 plugin tests, Go suite, build and smoke.
- **Caveat:** a new Figma plugin session still requires explicit source allowlisting because the immutable target includes the session ID.

### BUG-044 - Iterative Figma craft exhausted provider quota through tiny MCP calls

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-CRE-001` direct login craft forward test.
- **Symptom:** the direct design agent improved the artifact for roughly 14 minutes but stopped before final QA when the Codex usage quota was reached.
- **Trigger:** compose and refine a five-screen product journey through hundreds of independent low-level MCP calls.
- **Root cause:** the MCP write surface required one provider round-trip per create/clone/style operation, so tool-call overhead consumed the worker budget even though Figma execution itself stayed responsive.
- **Fix:** added guarded `apply_craft_patch` with 1-80 ordered operations, stable aliases and same-root enforcement; worker retries preserve and repair the existing Page under one 30-minute total deadline instead of rebuilding.
- **Regression test:** `craft-patch.test.ts`, full 268-test plugin suite and Go schema/registration tests pass; direct live repair applied 12 dependent operations in one call.
- **Caveat:** a full app-owned worker run still needs fresh Codex quota; usage-limit errors now preserve the partial artifact and report retry/resume semantics.

### BUG-045 - Figma worker could self-report visual QA without proving visible quality

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-CRE-001` screenshot review of the direct login craft.
- **Symptom:** a structurally complete artifact still contained source-demo copy, near-invisible consent labels and a title extending outside its card.
- **Trigger:** trust the model report or structural lifecycle read-back without comparing screenshots and rendered text conditions.
- **Root cause:** screenshot calls, post-screenshot refinement and visual defect checks were claims in the provider report rather than independently observed gates.
- **Fix:** the host now requires observed initial/final screenshot calls with a write between them, then runs `audit_product_craft` independently and feeds exact findings into bounded repair passes. The audit checks stale/forbidden copy, effective opacity, paint contrast including covering siblings, screen/container overflow, ZDS adoption and prototype links.
- **Regression test:** `product-craft-audit.test.ts`, worker evidence tests and optional live craft audit pass. Final live root `496:18760` reports five screens, 18 ZDS instances, five prototype links and zero issues across 415 nodes; the final screenshot was visually reviewed.
- **Caveat:** deterministic audit complements rather than replaces screenshot critique; taste, hierarchy and narrative still require the skill-driven visual review loop.

### BUG-046 - Conversation-first threads still looked like lifecycle steps

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-CRE-001` live Electron replay.
- **Symptom:** a new free-form conversation kept a blank canvas but the header/history said `Discover`, while Mock replied with a generic “đào sâu hoặc vẽ flow” template.
- **Trigger:** create a new thread with Mock Offline and discuss an idea without kickoff or an explicit visual request.
- **Root cause:** renderer exposed the persisted workflow-view column directly and Mock route output discarded the idea tension despite receiving recent messages.
- **Fix:** main now derives a renderer-only `collaborationMode` from canonical RunState; IDEA_INTAKE renders as Studio without changing lifecycle. Mock route preserves the latest substantive idea, surfaces a concrete hypothesis/uncertainty and offers optional content-specific suggestions.
- **Regression test:** reasoning tests prove the medicine/privacy tension stays conversational with no commands and that follow-up critique reuses the original idea. Live replay showed `Studio · tự do khám phá`, zero canvas shapes and three optional next actions.
- **Caveat:** Mock remains a deterministic rehearsal provider; live providers own broader creative reasoning through the same route schema.

### BUG-047 - Deterministic canvas fallback dropped chat context and leaked agent selection

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-CRE-001` chat-to-canvas replay.
- **Symptom:** “phác moment chính” drew a generic input/validate/confirm flow, and newly created prototype screens remained selected as if the user had selected them.
- **Trigger:** explicitly request a flow/prototype after discussing a care-reminder privacy tension with Mock Offline.
- **Root cause:** the deterministic fallback had no matching domain scene and selected generated nodes for camera focus without always clearing/restoring the prior user selection.
- **Fix:** added a 13-node consent-first care flow and five authored prototype screens, preserving workflow/prototype placement on one canvas. Canvas execution now restores the user's prior selection or clears agent-created focus. Selection-only Sync produces a targeted critique; accepting the suggested positive-copy refinement updates exactly the selected shape.
- **Regression test:** canvas tests cover the care workflow, distinct prototype, exact one-shape copy update and no scene rebuild; live Electron replay verified five semantic screens/four links, one selected block, one applied update and 63-shape read-back with unchanged ProductSpec.
- **Caveat:** domain fixtures make Mock demos credible; arbitrary domains should use a creative LLM provider or an added deterministic fixture rather than the generic fallback.

### BUG-048 - Figma Starter Page cap blocked the approved design before craft

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-CRE-001` app-owned live Figma run.
- **Symptom:** `apply_lifecycle_artifact_plan` failed immediately with `The Starter Plan Only Comes With 3 Pages`; the Codex craft worker never started.
- **Trigger:** execute an approved artifact while the ZDS source, an existing PM output and an experiment already consume all three free Pages.
- **Root cause:** plugin recovery recognized only an exact-name incomplete Page and otherwise called `figma.createPage()`. A complete same-product managed Page with another recipe version was invisible to the allocator.
- **Fix:** attempt creation first, then on the typed Starter-cap error reuse exactly one same-product Page only when every direct child is a PM Lifecycle artifact root. Prior roots remain untouched as sibling sections; the new root is placed to the right, Page rename commits only after successful render and failure restores the old Page.
- **Regression test:** lifecycle plugin tests prove safe reuse, no overlap/preservation and refusal when any user-authored node exists. The live run reused `PM · Mini App đặt suất ăn trước · v2` as `v1`, preserved the prior root and verified new root `512:19179`.
- **Caveat:** an ambiguous match or mixed-content Page still fails with `FIGMA_PAGE_LIMIT`; the plugin never deletes a user Page to make room.

### BUG-049 - Figma reconnect left retry pinned to an expired immutable session

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-CRE-001` live retry after rebuilding/reopening the plugin.
- **Symptom:** Retry reported `Figma Session Không Còn Tồn Tại` even after the current Page had been allowlisted again; successful Jira/PRD targets remained visible but Figma could not proceed.
- **Trigger:** prepare and approve a live target, reconnect the plugin so its random session ID changes, then retry the failed Figma action.
- **Root cause:** the old approval correctly pinned the prior target hash, but retry had no transition for replacing only that immutable action. Reusing its payload would violate the approval boundary.
- **Fix:** a target mismatch transitions Delivery partial failure back to a Figma-only `WAITING_FOR_APPROVAL`, creates a revisioned action and target-scoped idempotency key, and keeps historical outbox rows. Execution summaries select the latest immutable action per target, so the new Figma result combines with prior verified Jira/Zdoc receipts.
- **Regression test:** workflow test covers `REPREPARE_ARTIFACT`; outbox test retains four historical rows while summarizing three latest targets. Live UI displayed `Rebind Figma`, approved only Figma, then reached all-target `Verified` with Figma 396 seconds and Jira/PRD attempt 1.
- **Caveat:** reconnect is a new external-write approval by design; the app must never silently transplant an approval to another session.

### BUG-050 - Creative Figma craft could pass with visibly drifted ZDS controls

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-FIG-010` follow-up visual review.
- **Symptom:** Figma output became more product-like, but cloned components could still look misaligned, overlap another control or drift outside the intended mobile frame.
- **Trigger:** a creative worker freely resizes/moves cloned ZDS instances during a craft/refinement pass, then reports success after screenshots and the older audit checks only screen count, ZDS count, prototype links, copy, contrast and text clipping.
- **Root cause:** independent `audit_product_craft` had no geometry rules for top-level ZDS instance containment, sibling overlap or minimum interactive touch target size. The worker prompt asked for visual QA, but Agent Core had no deterministic defect code to force a repair pass for component drift.
- **Fix:** added post-worker audit gates for `ZDS_INSTANCE_WITHOUT_SCREEN`, `ZDS_INSTANCE_OUTSIDE_SCREEN`, `ZDS_INSTANCE_OUTSIDE_PARENT`, `ZDS_INSTANCE_OVERLAP` and `TOUCH_TARGET_TOO_SMALL`; exposed `componentDriftCount`, `componentOverlapCount` and `undersizedTouchTargetCount` in the typed audit schema. Updated Figma design/visual-QA skills with the new repair contract.
- **Regression test:** `mcp-tool/za-talk-to-figma/plugin/src/product-craft-audit.test.ts` now blocks drifted, overlapping and undersized top-level ZDS instances; workspace schema test fixture includes the new metrics.
- **Caveat:** this is a deterministic geometry guard, not an aesthetic judge. It stabilizes component placement while leaving product composition and visual taste to the design worker plus critic skill.

### BUG-051 - Figma worker skill import depended on source repository paths

- **Status:** FIXED
- **Found:** 2026-07-26, `P0-PKG-001` packaging review.
- **Symptom:** Dev runs could use `skills/pm-lifecycle-*`, but a packaged Electron app would not necessarily have `/repo/skills/...` or `report.schema.json` at the same path.
- **Trigger:** Package the app so `app.isPackaged` is true and Figma runtime lives under `process.resourcesPath/figma-runtime`; the old `repositoryRoot()` derived from the runtime binary no longer points at the source checkout.
- **Root cause:** `buildFigmaDesignWorkerPrompt` embedded repo-relative skill file paths and `CodexFigmaDesignWorker.run` loaded the output schema from `task.repositoryRoot`. In packaged mode, that root is not a stable contract.
- **Fix:** added a global skill pack loader that resolves dev `skills/` or packaged `resources/skill-packs`, reads the skill/reference/schema content, computes a stable hash and injects the bundle directly into the worker prompt. The worker now uses the bundled schema and a neutral packaged `userData` cwd.
- **Regression test:** `apps/desktop/src/main/skill-packs.test.ts` covers packaged resource precedence, dev fallback and actionable missing-pack errors. `figma-design-worker.test.ts` verifies prompts contain embedded skill content and no repo-path import instruction.
- **Caveat:** The packager now copies `apps/desktop/out/package-resources/*` into Electron resources and `./run.sh dist` verified a local DMG. Final signed/notarized distribution remains a separate Apple Developer ID gate.

### BUG-052 - AgentRouter raw SDK path was blocked by client WAF

- **Status:** FIXED
- **Found:** 2026-07-29, `P0-PRV-003` AgentRouter integration.
- **Symptom:** Direct `fetch`/OpenAI SDK style requests to AgentRouter returned `401 unauthorized client detected`; the earlier `co.agentrouter.org` test returned a misleading invalid-key result.
- **Trigger:** Call `https://agentrouter.org/v1/models`, `/v1/chat/completions` or `/v1/messages` from a generic Node client with the AgentRouter key.
- **Root cause:** The official China docs target `https://agentrouter.org`/`https://agentrouter.org/v1`, and AgentRouter appears to enforce client/wire compatibility. Generic SDK traffic is blocked even when the key reaches the service.
- **Fix:** Replaced the raw AgentRouter SDK adapter with an AgentRouter-specific Codex app-server bridge that writes a temporary keyless `CODEX_HOME/config.toml` using `wire_api = "responses"`, passes the key only as `AGENT_ROUTER_TOKEN`, and cleans the temp home after each turn. UI now exposes the three allowed account models as a selector.
- **Regression test:** `packages/reasoning/src/index.test.ts` covers endpoint resolution and includes gated live test `PM_AGENT_AGENTROUTER_LIVE=1 ... -t 'runs AgentRouter'`, which passed for `gpt-5.6-sol`. `packages/persistence/src/history-store.test.ts` covers seeded model options.
- **Caveat:** `claude-opus-4-8` and `claude-opus-5` were selectable but returned repeated reconnect/high-demand errors through the Codex Responses bridge in manual tests. A dedicated Claude-Code-compatible wire adapter is still needed if those two models must be demo-reliable.

### BUG-053 - GitHub Release did not publish a standalone Figma MCP/plugin bundle

- **Status:** FIXED
- **Found:** 2026-07-29, `P0-DEM-002` release review.
- **Symptom:** Release expectations included app installer plus MCP/plugin, but the workflow only relied on electron-builder installer assets. Local release output could be confused with `.dmg.blockmap` or transient DMG lock files, and the packaged app copied the whole plugin source tree instead of a minimal runtime.
- **Trigger:** Inspect `.github/workflows/release.yml`, `apps/desktop/package.json` `extraResources`, and `apps/desktop/release/mac-arm64/.../Resources/figma-runtime`.
- **Root cause:** `scripts/prepare-package-assets.mjs` packaged only skill packs. Electron extraResources copied Figma runtime directly from source paths, while GitHub Release had no separate asset for users who need the Figma MCP/plugin bridge outside the app.
- **Fix:** `prepare-package-assets.mjs --strict-figma` now copies minimal `figma-runtime` (OS binary + plugin manifest/dist) into `apps/desktop/out/package-resources`. Electron extraResources consumes that canonical tree. GitHub Actions builds the plugin once, packages app installers per OS and uploads `za-talk-to-figma-plugin.zip` plus OS-specific `za-talk-to-figma-runtime-<os>-<arch>.zip`.
- **Regression test:** `node scripts/prepare-package-assets.mjs --strict-figma` produced exactly the minimal runtime files; `./run.sh dist` rebuilt Go/plugin and produced a valid local macOS DMG plus blockmap with no `.lock`; archive listing test covered the standalone runtime zip direction.
- **Caveat:** Remote GitHub Release upload itself still needs validation by pushing a version tag.

### BUG-054 - Windows release job built the nested Figma plugin with the wrong package manager

- **Status:** FIXED
- **Found:** 2026-07-29, `v0.1.1` GitHub release run.
- **Symptom:** macOS release job passed, but Windows failed at `Build Figma plugin bundle` before packaging artifacts.
- **Trigger:** Push tag `v0.1.1` and inspect GitHub Actions job metadata for the Windows matrix target.
- **Root cause:** The nested `mcp-tool/za-talk-to-figma/plugin` project is Bun-owned (`bun.lock`) and is not part of the root pnpm workspace. The release workflow tried to run a separate pnpm install/build from that folder on Windows, diverging from the local `make build`/`./run.sh dist` path.
- **Fix:** Install Bun in the release workflow and build the plugin with `bun install --frozen-lockfile`, `bunx tsc --noEmit -p tsconfig.json` and `bun run build` on both OS targets.
- **Regression test:** Local `./run.sh dist` still exercises the same Bun-backed plugin pipeline before Electron packaging; remote validation is the `v0.1.2` tag run.
- **Caveat:** `v0.1.1` should be ignored because its Windows artifacts are incomplete.

### BUG-055 - Release workflow duplicated Figma plugin builds and split release ownership

- **Status:** FIXED
- **Found:** 2026-07-29, release asset audit after `v0.1.2`.
- **Symptom:** The workflow built the same Figma plugin in both macOS and Windows matrix jobs, while `electron-builder --publish always` and `softprops/action-gh-release` both tried to own release assets. The user-facing GitHub draft and unauthenticated release API could show different asset sets while uploads settled.
- **Trigger:** Push a version tag and compare the draft Release UI against the public release API asset list.
- **Root cause:** The Figma plugin bundle (`manifest.json`, `dist/code.js`, `dist/index.html`) is OS-independent, but it was treated like per-OS runtime input. Release publishing was split between Electron Builder and a second upload action.
- **Fix:** Build the Figma plugin once in a dedicated Ubuntu job, upload it as an artifact, reuse it in OS matrix jobs through `PM_AGENT_FIGMA_PLUGIN_SOURCE`, build only the Go runtime per OS, and publish all assets from one final release job as `.zip` bundles.
- **Regression test:** Workflow structure now has a single `publish-release` owner and no plugin build step inside the OS matrix. Local `./run.sh dist` remains the package smoke for current OS.
- **Caveat:** This workflow change affects the next tag after `v0.1.2`; the existing `v0.1.2` draft can still be published manually if its visible asset list is acceptable.

### BUG-056 - Explicit no-ZDS Figma pages degraded to mock instead of drawing live

- **Status:** FIXED
- **Found:** 2026-07-29, user trace with a newly created Figma Page and no ZDS components.
- **Symptom:** The user selected/created a blank Figma Page, expected the agent to draw there without ZDS, but artifact creation did not produce a live design on that Page.
- **Trigger:** Connect Figma plugin, switch to a new blank Page, allow the current Page, then request/create Figma design without intending to use ZDS.
- **Root cause:** A Page without ZDS captured as `fixture_fallback`; `figmaExecutionContext()` routed all fixture fallback contexts to `connectorMode: mock`, so live Figma writes were skipped. Worse, if live-free reused the synthetic ZDS manifest, preflight could resolve fake component keys and apply would try to clone unavailable components.
- **Fix:** Add explicit no-ZDS target mode (`creativeMode: free`) and UI button. Free targets remain `connectorMode: live`, `planMode: free`, use a live-primitives manifest with no components, and set `pageStrategy: use_target_page`. The plugin handles that strategy by appending the artifact root to the selected Page without renaming/deleting it.
- **Regression test:** Connector tests cover distinct free target hash and primitive-only free preflight; reasoning test proves empty-role scaffold creates primitive actions; plugin lifecycle test proves `use_target_page` draws on the selected Page with no extra Page.
- **Caveat:** Creating a brand-new named Page from app chat/slash is still a follow-up; today the user creates/opens the desired Page in Figma, then clicks `Không dùng ZDS`.

### BUG-057 - No-ZDS retry reused stale Mock Figma payload

- **Status:** FIXED
- **Found:** 2026-07-29, user runtime trace after no-ZDS Page selection.
- **Symptom:** Artifact sync showed `Partial Failure` with `Mock Figma Idempotency Conflict`; retry spammed `Chỉ có thể rebind Figma sau một artifact execution chưa hoàn tất`.
- **Trigger:** A thread had an old/mock Figma action, then the active Figma target changed to a live free Page and the user retried or regenerated Figma.
- **Root cause:** Explicit no-ZDS preparation could still fall back to the offline mock when live planning/preflight failed, producing a stale `ffffffff...` target payload. Mock regenerate idempotency omitted the revision/target suffix, causing conflicts with a previous mock receipt. Rebind also only accepted `DELIVERY/PARTIAL_FAILURE` and did not gracefully handle an already-created Figma approval.
- **Fix:** `creativeMode: free` is always treated as live/free, even if its saved context is absent. Explicit no-ZDS planning fails loudly instead of degrading to mock. The Figma worker uses the selected target Page as output for `use_target_page`. Mock fallback idempotency includes revision/target suffix. Reprepare now supports Delivery and Change partial failures and repeated retry clicks return the existing pending-approval message.
- **Regression test:** `./run.sh typecheck`; `pnpm vitest run packages/agent-core/src/impact.test.ts packages/connectors/src/figma-artifact-plan.test.ts packages/connectors/src/figma-mcp.test.ts packages/reasoning/src/index.test.ts`; full `./run.sh test`; `./run.sh build`; plugin `bun test src/lifecycle-artifact.test.ts`.
- **Caveat:** If Figma plugin/session is genuinely disconnected, no-ZDS now blocks with an explicit live-target error instead of producing a mock preview; this is intentional for honest demo behavior.

### BUG-058 - Free Figma blueprints still required ZDS component roles

- **Status:** FIXED
- **Found:** 2026-07-29, no-ZDS retry after BUG-057.
- **Symptom:** Artifact sync failed with `Figma live free target chưa sẵn sàng (Creative screen ... is missing required ZDS roles: App-Header, Primary-Button)` even though the user explicitly selected `Không dùng ZDS`.
- **Trigger:** Prepare or retry a live free target with a creative/scaffold blueprint whose screen elements are primitives rather than ZDS component elements.
- **Root cause:** `createFigmaArtifactPlan` validated creative blueprint screen roles before respecting `mode: free`; preflight also warned about missing ZDS-backed controls for all modes except severity downgrade.
- **Fix:** Free mode skips required ZDS role matching and suppresses the `CREATIVE_ZDS_CONTROL_MISSING` adoption issue. Reference/strict plans keep the ZDS role/adoption guard.
- **Regression test:** `packages/connectors/src/figma-artifact-plan.test.ts` covers primitive-only creative blueprints on a no-ZDS live target. `pnpm vitest run packages/connectors/src/figma-artifact-plan.test.ts`, `./run.sh typecheck`, `./run.sh test`, and `./run.sh build` pass.
- **Caveat:** Free mode still validates ProductSpec screen traceability, placeholder copy and compact component copy limits when an element is explicitly a component.

### BUG-059 - No-ZDS craft was still implicitly mobile-only

- **Status:** FIXED
- **Found:** 2026-07-29, user asked whether free/no-ZDS supported web design.
- **Symptom:** Even after removing ZDS role requirements, no-ZDS Figma still inherited mobile Mini App assumptions from provider prompt, scaffold dimensions, craft skill instructions and product-craft audit screen detection.
- **Trigger:** Use `Không dùng ZDS` for a web/admin/dashboard/landing brief.
- **Root cause:** Mobile/ZDS assumptions were spread across multiple layers: provider policy hard-coded `390x844`; deterministic scaffold returned `390x844`; craft worker skill and QA references required Mini App/mobile; audit counted only 320-480px-wide mobile frames and required at least one ZDS instance.
- **Fix:** Free/no-ZDS mode now uses adaptive-surface guidance and desktop-sized fallback frames for web-like ProductSpecs. Worker prompt/skill pack distinguishes no-ZDS adaptive mode from ZDS/reference Mini App mode. Worker report and plugin audit allow zero ZDS instances for free mode. Product-craft audit detects lifecycle metadata/adaptive product frames and no longer labels every screen as mobile.
- **Regression test:** Reasoning test covers adaptive desktop scaffold; worker test covers `zdsInstanceCount: 0` only when allowed; plugin audit test covers 1280x900 free desktop frame with no ZDS instances. Full `./run.sh test`, plugin typecheck/build, `./run.sh build` and final `./run.sh typecheck` pass.
- **Caveat:** ProductSpec still carries `designSystemRoles` as a domain field; free mode ignores those roles for Figma composition rather than removing them from ProductSpec.

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
- The public page exposes copied ZDS controls primarily as external-library `INSTANCE` nodes, not local component definitions. Bounded discovery now retains 199 representative variants and normalizes them into semantic same-file bindings.
- Plugin connection is not permission: readiness requires an immutable hash over exact session/file/page identity plus cached DS context. A session/page mismatch removes ready state.
- MCP tool `plan_design_system_screens` is intentionally pure: it receives the host-approved target and normalized manifest, computes the full strict decision and plan hash, and has no `Runtime` parameter capable of issuing plugin writes.
- Lifecycle Figma apply uses plugin data key `za-pm-lifecycle`; root metadata owns idempotency/plan/target identity, screen metadata owns requirement traceability, and slot metadata owns resolved component role. Strict apply removes the root before returning an error if any component cannot be instantiated.
- Cross-runtime approval hashes use recursively canonicalized JSON in both Go and TypeScript. Go struct serialization order is not an approval-hash contract.
- Lifecycle artifact roots are direct page children by contract; idempotency/read-back inspects that bounded set rather than traversing the full design file.
- Same-file catalog selection prefers light/default, correctly leveled variants and rejects bindings outside the pinned page. If bounded live capture cannot produce either component definitions or usable instances, the app persists a labeled `fixture_fallback`; free-mode writes use primitives with no fixture component keys.

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
./run.sh typecheck   # verified 2026-07-26
./run.sh test        # verified 2026-07-26; 168 tests pass, 2 optional tests skipped
./run.sh build       # verified 2026-07-26; also prepares packaged skill-packs resources
./run.sh smoke       # verified 2026-07-26; Mock provider + canvas + Markdown artifact; copies packaged skill-packs resources first
./run.sh smoke-recovery  # verified 2026-07-22; injected Jira failure + target-only UI retry
./run.sh smoke-reset # verified 2026-07-22; UI reset + three deterministic seeds + full flow
./run.sh smoke-canvas # verified 2026-07-22; drag/undo/delete boundary + invalid command + full flow
./run.sh smoke-ambiguity # verified 2026-07-22; NEEDS_USER_INPUT + no-write guard + resolved full flow
./run.sh smoke-canvas-agent  # verified 2026-07-23; draw + selected feedback + script + promotion + verified artifacts
./run.sh smoke-codex-canvas  # verified 2026-07-23; real Codex Canvas Program + topology guard + verified artifacts
PM_AGENT_SMOKE_PROVIDER=codex-local ./run.sh smoke  # verified 2026-07-22
PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke  # verified 2026-07-23; strict same-file ZDS write + read-back/audit + non-mock receipt
```

Command MCP đã chạy thành công:

```text
cd mcp-tool/za-talk-to-figma && go test ./...  # verified 2026-07-26
cd mcp-tool/za-talk-to-figma/plugin && bun run typecheck  # verified 2026-07-26
cd mcp-tool/za-talk-to-figma/plugin && bun test  # verified 2026-07-26; 271 tests pass
cd mcp-tool/za-talk-to-figma/plugin && bun test src/product-craft-audit.test.ts  # verified 2026-07-26; 3 tests pass
cd mcp-tool/za-talk-to-figma/plugin && bun run build  # verified 2026-07-26
pnpm package:assets  # verified 2026-07-26; copies PM skill packs into apps/desktop/out/package-resources
PM_AGENT_FIGMA_LIVE=1 pnpm exec vitest run packages/connectors/src/figma-mcp.live.test.ts  # verified 2026-07-23
pnpm vitest run --exclude apps/desktop/src/main/canvas-bridge.test.ts --exclude packages/connectors/src/figma-runtime.test.ts  # verified 2026-07-23; 118 pass, 1 optional live skip
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
- Restricted execution sandbox không cho Node/Go test mở localhost listener và Electron GUI kết thúc bằng `SIGABRT`; dùng non-socket suite plus targeted lifecycle/plugin tests here, then run smoke and live Figma review in the normal desktop session.

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

### 2026-07-23 - Thread-specific kickoff package and live Figma write

- Decision completion now synthesizes and atomically commits a validated ProductSpec from the active thread instead of leaving a placeholder draft.
- Added an explicit kickoff-package approval path: live or mock Figma, labeled backlog mock and a generated Markdown PRD with requirement/screen/story traceability.
- Live public-page execution uses a pinned target and an honestly labeled primitive fallback when no component map is available; strict mode remains reserved for a captured live mapping.
- Upgraded the Figma compositor with distinct screen frames, titles, purposes, semantic slot styling, non-overlapping placement and auto-focus.
- Fixed cross-runtime plan-hash canonicalization and removed deep-tree idempotency scans that caused live timeouts on large files.
- Verification: 112 tests + 1 optional live skip, workspace typecheck/build, `./run.sh smoke-lifecycle`, 256 plugin tests, Go suite, live adapter test and `PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke` pass. App smoke recorded live Figma node `444:16250` and verified Figma/Jira/Zdoc plus Markdown.
- Next action: finish `P0-QA-001`, then select/live-test one API provider and complete Electron E2E plus packaging/rehearsal.

### 2026-07-23 - Strict same-file ZDS catalog

- Reclassified `[PUBLIC] Zalo Mini App Framework 2.0 - dup` from a false empty-component fallback to an allowlisted same-file ZDS catalog by discovering copied external-library instances.
- Added role-aware representative capture, component-property preservation and light/default variant scoring for headers, buttons, inputs, OTP, lists, status messages, modals and selection controls.
- Strict Figma plans now carry typed source bindings, clone exact page-scoped instances, apply ProductSpec text, and independently verify both actual `INSTANCE` nodes and immutable bindings.
- Onboarding ProductSpec synthesis now requests concrete text/phone/OTP/status roles rather than generic controls.
- Verification: 114 workspace tests pass plus one optional live skip; 259 plugin tests, plugin typecheck/build, Go suite, workspace typecheck/build and live smoke pass. Live Figma node `449:16909` was visually reviewed and verified with light/default list and primary-button variants.
- Next action: continue `P0-QA-001` critical-matrix reconciliation, then Electron E2E and packaging/rehearsal.

### 2026-07-23 - Reviewable reminder-backup artifacts and thread activity

- Replaced global renderer `sending` state with an owning thread ID, guarded stale async completion and added a main-process global one-turn lock. Other histories remain readable but cannot send while a turn is active.
- Reserved a stable selection-context slot so canvas selection no longer moves the chat/product inspector. Added one-click export for chronological chat, ProductSpec Markdown/JSON, canvas, workspace and a single `review-bundle.json`.
- Added a reminder-backup flow with setup, due reminder, immediate backup, snooze, skip, failure and retry paths. Prototype output now has five distinct detailed backup screens; redraw replaces only the same scene type and keeps workflow plus prototype available on one canvas.
- ProductSpec synthesis and Figma slot content now preserve the same reminder-backup journey. Strict recipe-v3 apply keeps the selected public framework Page as the ZDS source and writes each new artifact to a named dedicated Page with audited page identity.
- Verification: workspace typecheck/build, 118 non-socket tests plus one optional skip, 259 plugin tests/typecheck/build and targeted lifecycle Go tests pass. Full socket tests and Electron smoke are blocked by this execution sandbox; normal-session visual canvas/Figma review is the only remaining acceptance item.
- Next action: run `./run.sh reset`, review the reminder-backup canvas and dedicated Figma Page, then close `P0-UX-001` and resume `P0-QA-001`.

### 2026-07-24 - Product-grade Figma Design Blueprint

- Reframed Figma as the near-product design realization surface: ProductSpec remains business truth, the Design Blueprint owns concept/hierarchy/content/states, and the allowlisted ZDS catalog guards interaction controls.
- Added reminder-backup concept `Quiet confidence` with five distinct product archetypes and domain content; the compositor now varies status, metric, choice, timeline, progress, info and confirmation treatments instead of repeating one wireframe.
- Dedicated output Pages include a rendered design brief, strict same-file ZDS instances, tailored navigation and real smart-animate navigation reactions.
- Read-back derives concept/sections/edges from rendered nodes and reactions. Removing those nodes or reactions causes TypeScript/Go audit mismatch instead of a false verified receipt.
- Verification: workspace typecheck, 122 tests + 1 optional skip, production build, `./run.sh smoke-lifecycle`, 260 plugin tests/typecheck/build, full Go suite and rebuilt MCP/plugin artifacts pass.
- Next action: generate recipe-v4 through the approved live Figma path, visually review the dedicated reminder-backup Page, then close `P0-FIG-008` and resume `P0-UX-001`.

### 2026-07-24 - Creative chat and provider-authored native scenes

- Split provider work into lightweight conversation turns and rich creative canvas turns. Ordinary product discussion stays conversational and preserves a blank canvas; explicit drawing, selected feedback and typed CanvasDiff sync load the scene contract.
- Extended Canvas Programs with scene identity, workflow hierarchy, tone/lane/icon metadata and authored prototype screen blocks. Provider output is the creative authority; Agent Core owns policy, dependency-ordered execution, checkpoint and read-back. Deterministic planning is fallback only.
- Upgraded tldraw rendering to editable workflow cards and five-screen product concepts with native text, variable content-aware geometry, semantic connections, local-edit camera focus and one stable canvas per thread.
- Sync now compares against a thread canvas baseline and sends bounded created, updated, moved and deleted changes. Ambiguous edits ask for a target immediately; selected edits use the actual semantic ID instead of a template ID.
- Verification: `./run.sh typecheck`, `./run.sh test` (124 pass + 1 optional skip), `./run.sh build`, `./run.sh smoke-lifecycle`, `./run.sh smoke-flow` and `./run.sh smoke-codex-canvas` pass. The live Codex smoke verifies blank-first discussion, a provider-authored 20-node scene, selected retry/error feedback, ProductSpec promotion, developer Canvas Program and artifact read-back.
- Performance note: observed Codex conversation turns completed in roughly 20-25 seconds and rich workflow turns in roughly 94-102 seconds. Use Codex live to prove creative authority; keep Mock/Offline as the deterministic rehearsal fallback.
- Next action: choose one remaining slice: visually finish the dedicated live Figma Page under `P0-FIG-008`, or complete export/thread UX review under `P0-UX-001`.

### 2026-07-24 - Observable natural-language Figma execution

- Routed explicit Figma/package requests and contextual approval into Agent Core instead of allowing the reasoning provider to promise an action it cannot execute.
- Preserved the immutable approval boundary: preparation persists the exact preflight payload, while approval executes only that pending payload hash.
- Added planning, availability, preflight, write, read-back, verification and completion progress with a stable UI region and live elapsed time. Final chat confirmation records Figma total, write and read-back durations.
- Removed duplicate post-apply traversal. Apply returns root/page receipt data; independent verification reads by the returned root ID and falls back to bounded idempotency lookup only when needed.
- Replaced fixed Figma apply limits with a size-aware 5-30 minute client budget. The MCP bridge/capability ceiling is 30 minutes, read-back is three minutes and five minutes without heartbeat is treated as inactivity.
- Expanded the labeled synthetic strict fixture with backup-flow roles without weakening strict live ZDS mapping.
- Added deterministic `/figma prepare|approve|create|status|retry`, `/canvas flow`, `/canvas prototype` and `/help` commands with composer discovery, keyboard selection and `/artifact` alias. Natural-language routing remains enabled.
- Verification: workspace typecheck, 132 tests plus one optional skip, production build, regular smoke and lifecycle smoke pass; smoke proves slash discovery/status routing stays app-owned, and lifecycle smoke proves five prototype frames, 58 editable children and bidirectional canvas sync. All 260 plugin tests/typecheck/build and full Go tests pass. Live smoke was attempted but no Figma plugin session connected to the isolated smoke runtime.
- Next action: keep Figma Desktop/plugin open against the launched runtime, run `PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke`, record the final Figma timing message and visually review the dedicated output Page.

### 2026-07-24 - Discovery checkpoint and free-form answer recovery

- Audited the exported ride-booking thread and confirmed canonical RunState never left `IDEA_INTAKE`; the missing choices were a lifecycle intent bug, not a renderer-only problem.
- Recognized `kickoff`, `kick off` and `kick-off` consistently, and persisted the Discovery checkpoint before the UI promises selectable clarification options.
- Accepted complete colon-delimited or Markdown three-line answers in chat and advanced them through the same validated Discovery-to-Decision boundary used by the option controls.
- Removed confirmed `doi` false positives from canvas edit classification so `tài xế đối tác` and `theo dõi chuyến` remain product conversation.
- Verification: targeted 20 tests, workspace typecheck, all 140 tests plus one optional skip and `./run.sh smoke-lifecycle` pass; smoke reports 3 questions, 3 options, custom-answer support, five prototype frames and no renderer error.
- Next action: rerun the exact ride-booking transcript in a new thread, then return to live Figma timing and normal-zoom visual review for `P0-FIG-008`.

### 2026-07-24 - Provider-owned semantic intent

- Removed production Vietnamese keyword classifiers for kickoff, canvas interaction and natural Figma routing.
- Added a provider-neutral intent envelope across Mock, Codex, OpenAI, Gemini and Anthropic structured outputs. The route schema stays small; only provider-approved `draw/edit` requests load Canvas Program.
- Kept slash commands deterministic and direct. Agent Core still blocks an edit without selection or a uniquely resolved semantic target, controls ProductSpec promotion and requires immutable approval for artifact writes.
- Target resolution now prefers exact Unicode Vietnamese and uses accent-folded matching only as a unique fallback after intent is already `edit`; ambiguous folded matches return no target.
- Verification: workspace typecheck, 134 tests plus one optional skip, lifecycle smoke, Mock canvas flow smoke and real Codex canvas smoke pass. Codex kept conversation blank, authored a 20-node scene, proposed an 11-operation selected edit, promoted ProductSpec and verified artifacts.
- Performance note: natural visual requests use two bounded provider turns; `/canvas flow|prototype` skips routing and remains the fast deterministic demo control.
- Next action: manually replay the ride-booking kickoff in the dev app, then return to connected-session Figma timing and visual review for `P0-FIG-008`.

### 2026-07-24 - Connected creative Figma close-out

- Moved visual authorship from the fixed compositor into a provider-owned Creative Figma Blueprint: arbitrary nested composition, product copy, primitives, ZDS roles and prototype edges. Agent Core now guards traceability, live target, content fit, immutable approval and read-back instead of prescribing the layout.
- Live strict capture retained 190 copied same-file ZDS instances, normalized 25 semantic bindings and 9 tokens with no fixture fallback. Codex planned 4 screens/51 layers in 181 seconds.
- Approved live apply recovered only an incomplete agent-owned Page, wrote in 4.7 seconds, read back in 0.5 seconds and verified root `489:16542`, 4 distinct screens, 16 real ZDS instances and 4 prototype edges.
- Final regression: workspace typecheck/build; 144 tests plus one optional skip; 262 plugin tests and plugin typecheck; full Go suite; canvas, semantic flow and approval-reject smokes. The semantic smoke caught and fixed overlong deterministic header copy before close-out.
- Next action: rehearse the exact hackathon script in a clean workspace, export the review bundle and capture final canvas/progress/Figma visuals.

### 2026-07-26 - Conversation-first studio and independently audited Figma craft

- Replaced phase-shaped ordinary chat output with a compact collaboration route containing a direct response, explicit intent and up to three content-specific suggestions. Canvas selection is context only; `/studio explore|critique|sketch|refine` provides deterministic user control.
- Replaced the live one-shot composition path with an approved iterative Codex worker. The worker receives immutable ProductSpec truth, a sparse execution scaffold and a repository skill for experience direction, ZDS craft and screenshot QA; partial Pages are repaired rather than rebuilt.
- Added `apply_craft_patch` to batch dependent create/clone/style/prototype operations and `audit_product_craft` as an independent gate for screen count, ZDS adoption, real prototype links, stale/forbidden copy, contrast and text overflow.
- Forward-tested a five-screen ZaloPass login journey directly through the MCP. The provider stopped on usage quota after a long low-level pass, but the partial Page was retained; batch repair then removed stale source copy, corrected header/consent/action contrast and fixed a screenshot-detected success-card overflow.
- Final live audit on root `496:18760` passed 5 screens, 18 ZDS instances, 5 prototype links, 44 visible text nodes and zero issues across 415 nodes. Exported visual: `mcp-tool/za-talk-to-figma/artifacts/zalo-login-craft-audited.png`.
- Verification: 158 workspace tests plus one optional skip, workspace typecheck/build/smoke, 268 plugin tests/typecheck/build, full Go suite, skill validation and optional live craft audit pass.
- Next action: when Codex quota is available, run one complete app-owned `/figma create` execution and verify the automatic screenshot-refine-audit loop without manual MCP repair.

### 2026-07-26 - Studio-to-canvas consent-first replay

- Separated renderer collaboration mode from canonical lifecycle state: untouched IDEA_INTAKE threads now read as Studio in header/history without introducing a second workflow state machine.
- Made the Mock rehearsal content-aware across turns. A medicine-reminder idea surfaces its support-versus-surveillance tension, stays on a blank canvas and offers critique/boundary/sketch actions instead of forcing Discovery.
- Added a 13-node consent-first care workflow and five authored prototype screens with distinct states, sample data, privacy boundaries and support handoff. New scenes are placed beside existing work rather than replacing complementary workflow/prototype content.
- Completed a live two-way replay: chat -> explicit prototype -> select privacy block -> Sync critique -> accept positive-copy refinement -> exactly one canvas shape updated and read back; ProductSpec remained unchanged.
- Cleared agent-created selection while preserving prior user selection and moved scene controls to a compact icon rail so auto-fit content is not covered.
- Verification: 164 tests pass with two optional skips; workspace typecheck, production build and regular smoke pass. Smoke verifies Figma, Mock Jira and Mock Zdoc plus Markdown output.
- Next action: run one full app-owned live Figma worker execution when Codex quota is available, then capture the automatic screenshot-repair-audit evidence.

### 2026-07-26 - App-owned Figma craft, Page-cap recovery and critic skill

- Completed the missing app-owned live acceptance on the real public ZDS file. A stale session first returned to a Figma-only immutable approval; the new action preserved verified Jira/PRD targets and their attempt counts.
- Added safe Figma Starter recovery: the plugin reused only the same-product managed output Page, kept the complete prior `v2` root, placed the new `v1` root beside it and never touched the ZDS source or experiment Page.
- The Codex worker executed the full sparse-scaffold -> screenshot -> compose -> screenshot critique -> multiple refinement batches -> two audits -> final text scan -> lifecycle read-back loop. Root `512:19179` reached all-target `Verified` in 396 seconds.
- Exported `mcp-tool/za-talk-to-figma/artifacts/meal-ordering-app-worker-verified.png`. Visual review confirmed distinct browse, confirmation, pickup-code and wallet-recovery states; it also motivated a stricter product-fidelity contract for recognizable subjects and useful browse alternatives.
- Added and validated `pm-lifecycle-figma-critic`; the design worker now reads both design and critic skills. The critic rejects abstract subject placeholders, thin browse states, repeated templates and non-actionable success/recovery screens.
- Verification: 166 workspace tests pass with two optional skips; typecheck, production build and smoke pass. Plugin has 270 passing tests plus typecheck/build; full Go suite and both skill validators pass.
- Next action: use the stricter dual-skill craft loop for the final hackathon product scenario, then rehearse and capture the pitch flow in a clean workspace.

### 2026-07-26 - Figma component layout guard and skill-pack direction

- Added deterministic product-craft audit checks for top-level ZDS instance containment, parent drift, visible control overlap and undersized interactive touch targets.
- Audit failures now carry repairable codes and metrics: `componentDriftCount`, `componentOverlapCount` and `undersizedTouchTargetCount`.
- Updated the Figma design skill references so workers treat cloned ZDS instances as real app controls and repair audit failures instead of claiming visual QA success.
- Accepted ADR-022: PM Lifecycle should grow tldraw-style importable Skill Packs for domain recipes, visual validators and provider guidance, while Agent Core keeps approvals, allowlists and external writes.
- Verification: `./run.sh typecheck`, `./run.sh test` (166 pass, 2 skip), plugin `bun run typecheck`, plugin `bun test` (271 pass), targeted product-craft audit test, plugin build and `go test ./...` all pass.
- Next action: run the next live `/figma create` against the final demo idea and confirm the new guard forces repair rather than allowing drifted components through.

### 2026-07-26 - Package-safe global skill packs

- Replaced repo-path skill import in the Figma design worker with a global skill pack bundle loaded by Agent Core.
- Dev mode resolves skills from `skills/`; packaged mode resolves from `process.resourcesPath/skill-packs` with fallback candidates for common asar layouts.
- The Figma worker prompt now embeds the design and critic skill content plus references and carries `skillPack.id/version/hash` in the approved brief. The output schema is loaded from the bundle, not from `report.schema.json` on disk at worker time.
- Packaged worker cwd is `app.getPath('userData')`, since the worker is read-only and may only call the allowlisted Figma MCP.
- `./run.sh build` now invokes `pnpm package:assets`, copying `pm-lifecycle-canvas`, `pm-lifecycle-figma-design` and `pm-lifecycle-figma-critic` into `apps/desktop/out/package-resources/skill-packs` for production packaging.
- Verification: targeted worker/skill tests pass, `./run.sh typecheck`, `./run.sh test` (168 pass, 2 skip), `./run.sh build` and `git diff --check` pass.
- Next action: wire the final macOS packager to copy `apps/desktop/out/package-resources/*` into Electron resources together with the existing Figma runtime, then do a clean packaged-app rehearsal.

## 10. End-of-session checklist

- [ ] Cập nhật active/completed task và evidence trong `BACKLOG.md`.
- [ ] Ghi bug/fix/regression test mới.
- [ ] Ghi integration learning hoặc failed approach mới.
- [ ] Ghi command mới chỉ sau khi verify.
- [ ] Cập nhật blocker/risk và decision nếu contract thay đổi.
- [ ] Chỉ để một next action rõ ràng cho phiên sau.
