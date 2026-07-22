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
- **Milestone:** First runnable desktop vertical slice complete.
- **Completed task:** `P0-FND-001` Bootstrap workspace.
- **Current slice:** Electron shell, typed IPC, SQLite thread/message/canvas persistence, encrypted credentials, native provider adapters and one tldraw canvas per thread.
- **Next task:** `P0-FND-002` package boundary hardening, sau đó `P0-DOM-001` versioned ProductSpec schemas.
- **Last known repository state:** Có product spec, `project-tracking/`, root `AGENTS.md` và MCP Figma tại `mcp-tool/`; chưa có Git repository hoặc PM Lifecycle app code.
- **Known blockers:** Chưa có sanitized/allowed Zalo Design System source; cần trial/commercial/hobby tldraw license key trước production packaging; OpenAI/Gemini/Anthropic adapters chưa thể live-test khi không có API key.

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

- **Status:** OPEN
- **Found:** 2026-07-22, baseline MCP review before PM app implementation.
- **Symptom:** `bun test` reports 9 failures in `serializers.test.ts`; 242 tests pass.
- **Trigger:** Run plugin test suite. Failures expect solid paints as hex strings and non-solid paints to be discarded.
- **Root cause:** Confirmed implementation/test contract mismatch. `serializePaints` now returns structured paint objects and preserves gradients/images, while tests still assert the older hex-only contract. Product intent for the new rich shape must be confirmed before changing either side.
- **Fix:** Pending `P0-FIG-000`. Preferred direction is to preserve rich structured paint data for DS auditing, document/version the response shape and update stale tests/consumers after compatibility review.
- **Regression test:** Existing `serializers.test.ts` plus new gradient/image/opacity contract cases; full `bun test` must pass.
- **Caveat:** Do not “fix” by reverting to hex-only output without checking read consumers and DS audit requirements.

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
- Plugin verification: `bun run typecheck` passed; `bun test` has 242 pass/9 fail from `BUG-001`.

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
./run.sh typecheck   # verified 2026-07-22
./run.sh test        # verified 2026-07-22; 5 tests pass
./run.sh build       # verified 2026-07-22
./run.sh smoke       # verified 2026-07-22; Mock provider + canvas
PM_AGENT_SMOKE_PROVIDER=codex-local ./run.sh smoke  # verified 2026-07-22
```

Command MCP đã chạy thành công:

```text
cd mcp-tool/za-talk-to-figma && go test ./...  # verified 2026-07-22
cd mcp-tool/za-talk-to-figma/plugin && bun run typecheck  # verified 2026-07-22
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

## 10. End-of-session checklist

- [ ] Cập nhật active/completed task và evidence trong `BACKLOG.md`.
- [ ] Ghi bug/fix/regression test mới.
- [ ] Ghi integration learning hoặc failed approach mới.
- [ ] Ghi command mới chỉ sau khi verify.
- [ ] Cập nhật blocker/risk và decision nếu contract thay đổi.
- [ ] Chỉ để một next action rõ ràng cho phiên sau.
