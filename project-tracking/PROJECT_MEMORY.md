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
- **Milestone:** Planning complete; implementation not started.
- **Next task:** `P0-FND-001` Bootstrap workspace; implementation chưa bắt đầu.
- **Last known repository state:** Có product spec, `project-tracking/`, root `AGENTS.md` và MCP Figma tại `mcp-tool/`; chưa có Git repository hoặc PM Lifecycle app code.
- **Known blockers:** Chưa chọn real API provider cho release slot; chưa có sanitized/allowed Zalo Design System source; tldraw license cần review trước packaging.

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

App chưa có command. Command MCP đã chạy thành công:

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

Chưa có failed approach.

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

## 10. End-of-session checklist

- [ ] Cập nhật active/completed task và evidence trong `BACKLOG.md`.
- [ ] Ghi bug/fix/regression test mới.
- [ ] Ghi integration learning hoặc failed approach mới.
- [ ] Ghi command mới chỉ sau khi verify.
- [ ] Cập nhật blocker/risk và decision nếu contract thay đổi.
- [ ] Chỉ để một next action rõ ràng cho phiên sau.
