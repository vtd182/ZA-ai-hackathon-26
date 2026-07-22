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
- tldraw là projection và interaction layer, không phải business database.
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

- **Date:** 2026-07-22
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
- **Current task:** `P0-PER-001` migration ledger and complete local schema is `IN_PROGRESS`.
- **Current slice:** Add versioned migration ownership plus turns/provider-events/canvas checkpoints/artifact mappings tables and clean/upgrade round-trip tests.
- **Last known repository state:** Runnable Electron app with canonical ProductSpec v1/v2 flow, deterministic impact preview, approval persistence, tldraw projection, provider adapters and a verified live Figma read connection.
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

- Shape chỉ lưu entity ref và presentation metadata.
- Layout deterministic; model không sinh coordinates.
- Canvas interaction phát domain command; core validate rồi projection render lại.

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
./run.sh typecheck   # verified 2026-07-22
./run.sh test        # verified 2026-07-22; 56 tests pass, 1 optional live test skipped
./run.sh build       # verified 2026-07-22
./run.sh smoke       # verified 2026-07-22; Mock provider + canvas
./run.sh smoke-recovery  # verified 2026-07-22; injected Jira failure + target-only UI retry
./run.sh smoke-reset # verified 2026-07-22; UI reset + three deterministic seeds + full flow
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

## 10. End-of-session checklist

- [ ] Cập nhật active/completed task và evidence trong `BACKLOG.md`.
- [ ] Ghi bug/fix/regression test mới.
- [ ] Ghi integration learning hoặc failed approach mới.
- [ ] Ghi command mới chỉ sau khi verify.
- [ ] Cập nhật blocker/risk và decision nếu contract thay đổi.
- [ ] Chỉ để một next action rõ ràng cho phiên sau.
