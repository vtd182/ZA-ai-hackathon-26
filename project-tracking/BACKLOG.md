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

- **Status:** IN_PROGRESS (2026-07-22)
- **Depends on:** P0-DOM-001, P0-FND-003
- **Deliver:** provider interface, phase-specific schemas, deterministic MockReasoningProvider.
- **Acceptance:** cùng input/version cho cùng output; malformed output không mutate RunState.
- **Progress:** đã có provider interface, Zod-validated structured result và deterministic offline mock; còn thiếu phase-specific result schemas và malformed-output conformance test ở orchestration boundary.

### `P0-AGT-002` Core orchestration loop

- **Status:** TODO
- **Depends on:** P0-AGT-001, P0-DOM-002
- **Deliver:** build request, validate result, apply domain commands, completion/error conditions.
- **Acceptance:** fixture chạy Idea -> WAITING_FOR_DECISION và resume từ checkpoint.
- **Progress:** signature change flow đã validate provider result, tạo domain command, persist preview và resume ProductSpec/checkpoint; discovery Idea -> WAITING_FOR_DECISION chưa được orchestration thành workflow hoàn chỉnh.

### `P0-AGT-003` Provider registry and normalized events

- **Status:** TODO
- **Depends on:** P0-AGT-001
- **Deliver:** registry, capability probe, normalized stream events, cancellation và provider conformance kit.
- **Acceptance:** core/UI không import provider SDK type; malformed/partial stream không mutate canonical state.
- **Progress:** registry, probes và cancellation đã có; SDK types không leak khỏi reasoning package. Còn thiếu internal `ProviderEvent` stream union, batching và conformance kit.

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

## Epic E3 - Persistence

### `P0-PER-001` SQLite repositories and migrations

- **Status:** TODO
- **Depends on:** P0-DOM-001
- **Deliver:** schema/migration cho projects, threads, turns, messages, provider segments/events, canvas snapshots/patches, runs, spec versions, actions, approvals, receipts và mappings.
- **Acceptance:** migration chạy trên clean DB; repository round-trip giữ nguyên schema version.
- **Progress:** đã có clean-create schema cho threads/messages/segments/canvas, runs/spec versions/actions/approvals/checkpoints và Figma cache. Còn thiếu versioned migration ledger, receipts/outbox/artifact mappings, turns/events và round-trip coverage đầy đủ.

### `P0-PER-002` Transaction and checkpoint service

- **Status:** TODO
- **Depends on:** P0-PER-001, P0-DOM-002
- **Deliver:** atomic domain commit, approval+outbox commit, checkpoint summary.
- **Acceptance:** injected failure không tạo half-committed ProductSpec/action; restart load đúng phase.
- **Progress:** preview và approved ProductSpec/action/approval/checkpoint commit bằng SQLite transaction; restart cache/checkpoint đã có test. Còn thiếu approval+outbox atomic commit, failure injection và checkpoint summary/handoff.

## Epic E4 - Provider, history, desktop UX and canvas

### `P0-PRV-001` Provider segments and canonical handoff

- **Status:** TODO
- **Depends on:** P0-AGT-003, P0-PER-002
- **Deliver:** ProviderSegment persistence, HandoffPackage, safe checkpoint guards và cost/privacy confirmation.
- **Acceptance:** đổi provider giữ nguyên thread/canvas/ProductSpec; switch bị chặn khi stream/write chưa ổn định; không auto-fallback sang paid API.
- **Progress:** opaque provider segment và per-thread provider selection đã persist; UI chặn switch khi chat đang gửi. Còn thiếu canonical HandoffPackage, write-in-flight guard, explicit paid-provider confirmation và segment capability snapshot.

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

- **Status:** TODO
- **Depends on:** P0-PER-001
- **Deliver:** thread CRUD/archive, paginated messages, normalized parts/events, FTS5 search và indexes.
- **Acceptance:** 500-message fixture query theo page; app không load full transcript vào renderer.
- **Progress:** thread create/get/archive, capped recent messages, indexes và substring search đã có. Còn thiếu turns/parts/events, cursor pagination, FTS5 và 500-message performance test.

### `P0-HIS-002` Thread checkpoint and resume

- **Status:** TODO
- **Depends on:** P0-HIS-001, P0-PER-002
- **Deliver:** checkpoint schema, migration, latest restore và stale provider handling.
- **Acceptance:** restart app phục hồi phase, ProductSpec, messages và canvas; resume vẫn xem được offline.
- **Progress:** phase/messages/canvas snapshot/ProductSpec/run checkpoint đều persist trong SQLite và hydrate offline; còn thiếu stale-provider handling và explicit latest-checkpoint repository test qua full restart.

### `P0-HIS-003` History sidebar and chat stream UI

- **Status:** TODO
- **Depends on:** P0-HIS-001, P0-UI-001, P0-AGT-003
- **Deliver:** searchable/virtualized history, new/open/archive thread, paginated chat, streaming/cancel states.
- **Acceptance:** chuyển thread không trộn messages; provider/model/phase/status nhìn thấy rõ; stream delta được batch.
- **Progress:** sidebar search/new/open/archive, thread isolation, visible provider/model/phase và cancel state đã có. Còn thiếu virtualized history, paginated chat và normalized batched streaming deltas.

### `P0-HIS-004` One canvas per thread

- **Status:** TODO
- **Depends on:** P0-HIS-002, P0-CAN-001
- **Deliver:** CanvasDocument ownership, snapshot/patch persistence, hydrate active/unmount inactive canvas.
- **Acceptance:** thread A/B có canvas ID/state độc lập; turn tạo checkpoint thay vì canvas mới; resume giữ stable entity refs.
- **Progress:** active thread owns and hydrates one serialized tldraw snapshot; inactive canvas unmounts and stable ProductSpec refs project deterministically. Còn thiếu explicit CanvasDocument/checkpoint schema và A/B restart integration test.

### `P0-HIS-005` Chat-canvas bidirectional commands

- **Status:** TODO
- **Depends on:** P0-HIS-004, P0-CAN-002, P0-AGT-002
- **Deliver:** CanvasSelectionContext, chat domain commands, canvas gestures -> command preview, business/presentation undo boundary.
- **Acceptance:** chat có thể focus/remove entity; canvas delete/drag không mutate ProductSpec trước preview/approval.
- **Progress:** chat focus/remove/switch/add proposals and selection context work; canvas persistence is presentation-only. Còn thiếu guarded gesture-to-domain-command preview and business/presentation undo boundary.

### `P0-UI-001` Typed IPC and app shell

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-FND-001
- **Deliver:** main/preload/renderer contract, navigation, status bar, error boundary.
- **Acceptance:** context isolation bật; renderer không truy cập arbitrary Node API.
- **Evidence:** lifecycle APIs đi qua typed preload; production smoke xác nhận API/canvas với sandbox + context isolation.

### `P0-UI-002` Lifecycle workspace

- **Status:** TODO
- **Depends on:** P0-AGT-002, P0-UI-001
- **Deliver:** history + idea/chat intake, clarification, option lanes, selection, ProductSpec inspector.
- **Acceptance:** user hoàn thành decision flow; tối đa 3 câu hỏi; refresh/resume không mất thread state.
- **Progress:** three-panel history/canvas/chat workspace and ProductSpec projection are runnable; clarification questions, option lanes and decision selection are not implemented.

### `P0-CAN-001` Canvas shapes and deterministic layout

- **Status:** TODO
- **Depends on:** P0-UI-001, P0-DOM-001
- **Deliver:** custom shapes, four view layouts, stable entity refs and edges.
- **Acceptance:** snapshot cùng input giống nhau; shape chỉ chứa ref/presentation metadata.
- **Progress:** deterministic four-view coordinates and stable entity metadata are tested; currently uses tldraw note shapes and lacks explicit traceability edges/custom shape contract.

### `P0-CAN-002` ProductSpec projection and domain commands

- **Status:** TODO
- **Depends on:** P0-CAN-001, P0-DOM-003
- **Deliver:** projection renderer, selection sync, commands for option/change.
- **Acceptance:** canvas edit không sửa business state trực tiếp; command invalid bị reject.
- **Progress:** canonical ProductSpec projection is separate from canvas snapshots; provider commands are schema-validated and removal stays a visual proposal until approval. Còn thiếu canvas gesture validation and invalid-command tests at the UI/core boundary.

### `P0-UI-003` Artifact preview and approval

- **Status:** TODO
- **Depends on:** P0-AGT-004, P0-CAN-002
- **Deliver:** grouped actions, diff/summary, approve/reject, target labels (`Figma`, `Mock Jira`, `Mock Zdoc`).
- **Acceptance:** payload và target rõ ràng; approval status cập nhật theo state machine.
- **Progress:** Change Impact panel hiển thị ProductSpec v1→v2, exact entity changes, Figma/Mock Jira/Mock Zdoc và immutable approval commit. Còn thiếu reject/cancel control và execution/verification status per target.

### `P0-UI-004` Change Impact view

- **Status:** TODO
- **Depends on:** P0-DOM-004, P0-CAN-002
- **Deliver:** impacted highlights, before/after, target action list, partial failure status.
- **Acceptance:** remove-payment impact dễ đọc và không overlap ở demo viewport.
- **Progress:** impacted highlights, before/after version and target action labels render without overlap in smoke screenshot; partial failure/retry status is not wired.

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

## Epic E7 - Change synchronization

### `P0-CHG-001` Change intent and impact preview

- **Status:** TODO
- **Depends on:** P0-DOM-004, P0-UI-004
- **Deliver:** structured change request, ambiguity handling, immutable impact set and diff.
- **Acceptance:** preview không mutate state; ambiguous target chuyển `NEEDS_USER_INPUT`.

### `P0-CHG-002` Approved ProductSpec version update

- **Status:** TODO
- **Depends on:** P0-CHG-001, P0-AGT-004, P0-PER-002
- **Deliver:** version bump, removed scope semantics, new artifact action plans.
- **Acceptance:** reject/cancel giữ version cũ; approval commit atomic.

### `P0-CHG-003` Multi-target execute and partial retry

- **Status:** DONE (2026-07-22)
- **Depends on:** P0-CHG-002, P0-FIG-005, P0-MCK-002, P0-MCK-003
- **Deliver:** sync Figma + mock Jira/Zdoc, per-target receipts/status, retry failed target.
- **Acceptance:** một target fail không duplicate target đã pass; ít nhất hai target verified sau retry.
- **Evidence:** Figma + Mock Jira + Mock Zdoc execute qua durable outbox và hiển thị receipt/read-back status theo target. `./run.sh smoke-recovery` inject Jira failure, retries qua UI, kết thúc verified với attempts `1/2/1`; Figma/Zdoc attempts và external IDs không đổi, đồng thời lưu screenshot partial-failure.

## Epic E8 - Quality and demo

### `P0-QA-001` Unit and contract test gates

- **Status:** TODO
- **Depends on:** all P0 domain/core/connectors
- **Deliver:** coverage cho invariants, transitions, impact, approval, idempotency, connector parity.
- **Acceptance:** critical test matrix gồm provider/history/canvas/connector trong `TEST_AND_DEMO_PLAN.md` pass.

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
| `P1-ZDC-001` | Zdoc real sandbox connector | Được phép và có sandbox chính thức |
| `P1-JIR-001` | Jira real sandbox connector | Được phép và có sandbox chính thức |

## Blocker register

| ID | Blocker | Owner | Workaround | Status |
| --- | --- | --- | --- | --- |
| `BLK-001` | Schema/protocol Figma bridge | Team | Đã review source: stdio MCP + local WS, 98 tools, session routing và DS workflows | RESOLVED |
| `BLK-002` | Chưa có sanitized Zalo Design System manifest | Team/Design | Dùng synthetic fixture, ghi rõ trong demo | OPEN |
| `BLK-003` | Chưa xác nhận quyền dùng tldraw cho demo/pilot | Team | Review license trước packaging | OPEN |
| `BLK-004` | Chưa chọn real API provider cho release slot | Team | Probe credential/runtime, chọn sau provider conformance kit | OPEN |
