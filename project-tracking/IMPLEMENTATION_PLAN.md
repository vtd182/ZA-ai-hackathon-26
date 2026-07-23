# Implementation Plan

## 1. Mục tiêu triển khai

Xây một macOS desktop MVP chứng minh trọn vẹn agentic workflow:

```text
Idea
  -> discovery có evidence
  -> tối đa 3 clarification questions
  -> Minimal / Balanced / Ambitious
  -> human decision
  -> ProductSpec
  -> Requirement -> Screen -> Story map
  -> artifact preview + approval
  -> Figma guarded generation + Jira/Zdoc mock execution
  -> read-back verification
  -> change impact + approved sync
```

MVP được đánh giá thành công khi người xem thấy rõ ba điều:

1. Agent chủ động suy luận và lập kế hoạch, nhưng người dùng vẫn kiểm soát quyết định/write action.
2. Mọi artifact cùng sinh từ ProductSpec và có traceability.
3. Khi scope đổi, agent tìm đúng phần bị ảnh hưởng, cho xem diff, xin duyệt, cập nhật và verify.

## 2. Scope lock

### P0 bắt buộc

- Electron desktop app chạy bằng một command trên macOS.
- Một project có nhiều conversation threads; mỗi thread có một canvas riêng và có thể resume.
- History sidebar, chat streaming, direct canvas commands và thread checkpoint.
- Provider Registry, normalized events, canonical handoff và safe switching.
- Mock reasoning provider deterministic; Codex App Server là local adapter ưu tiên.
- Hackathon release cần ít nhất hai provider chạy end-to-end: Mock + một real provider. Bốn adapter Codex/OpenAI/Gemini/Anthropic đều có task và cùng conformance contract.
- tldraw là một infinite creative canvas; lifecycle nằm trong RunState/timeline, không khóa canvas bằng view tabs.
- Agent có normalized canvas inspect/apply/run-script/read-back tools; explicit draw intent có deterministic fallback.
- Canvas-to-ProductSpec là promotion preview/confirm, không phải implicit projection.
- SQLite persist được RunState, ProductSpec, approval, action và receipt.
- Jira/Zdoc connector mock có behavior gần thật: stable external ID, idempotency, read-back và injected failure.
- Figma connector tạo user-flow/low-fi từ component registry đã allowlist.
- Zalo Design System guard kiểm tra component, token, layout rule và metadata trước/sau execute.
- Approval bắt buộc trước mọi write.
- Change impact cho câu lệnh `Bỏ payment khỏi MVP`.
- Demo có happy path và fallback không phụ thuộc mạng.

### Không làm trong MVP

- Production Jira/Zdoc integration.
- Đọc/quét toàn bộ Zalo organization hoặc design library nội bộ.
- High-fidelity UI, code generation, real-time collaboration, multi-user, release tracking.
- Mid-turn provider switching, cross-device provider state transfer, nhiều project và central backend.
- Cross-device history sync, multi-user history và merge canvas giữa các thread.
- Agent tự sửa pixel hoặc tự ghi artifact khi chưa có approval.

## 3. Nguyên tắc build

- Đi theo vertical slice end-to-end, rồi mới thay mock bằng integration thật.
- Domain package không phụ thuộc Electron, React, tldraw, Figma hay connector cụ thể.
- Mọi output từ model/connector phải qua schema validation.
- UI render canonical state, không render raw model output như state chính.
- Conversation history và canvas ownership thuộc app; provider-native thread/interaction chỉ là opaque segment state.
- Provider adapter dùng native API semantics và normalized event stream; không ép mọi provider qua OpenAI-compatible schema.
- Figma guard là policy engine deterministic; model chỉ đề xuất semantic screen/component intent.
- Jira/Zdoc mock dùng cùng interface và verification semantics dự kiến cho connector thật.
- Demo fixture và offline fallback là P0, không phải phần polish cuối.

## 4. Milestones

### M0 - Foundation decisions and fixtures

**Outcome:** repo có thể bootstrap mà không còn quyết định nền tảng mơ hồ.

Work:

- Khởi tạo pnpm workspace, Electron Vite, React, TypeScript strict, Vitest.
- Chốt package boundaries và import rules.
- Tạo fixture meal-ordering, mock Jira/Zdoc dataset và sanitized Zalo Design System manifest.
- Định nghĩa thread/turn/message/canvas/provider-segment schemas và migration strategy.
- Rà capability thật của `mcp-tool/za-talk-to-figma` và khóa extension boundary.
- Định nghĩa schema versioning convention và ID convention.
- Tạo script `dev`, `test`, `typecheck`, `lint`.

Exit criteria:

- App shell mở được.
- Tạo/mở lại được thread shell với canvas ID ổn định.
- CI-local commands đều chạy được.
- Fixture không chứa production URL, token, tên người thật hoặc dữ liệu khách hàng.

### M1 - Deterministic vertical slice

**Outcome:** workflow chạy hết bằng mock, persist được và resume được.

Work:

- ProductSpec, RunState, workflow state machine, domain events.
- MockReasoningProvider trả discovery, questions, options và ProductSpec deterministic.
- Provider registry, normalized stream reducer và ProviderSegment persistence.
- UI history, intake/chat, solution selection, ProductSpec inspector và artifact preview tối thiểu.
- Approval/outbox/execution với MockJiraConnector.
- Read-back verification và stable idempotency key.
- Restart app load lại run.
- Restart app load lại đúng thread, messages, ProductSpec và canvas checkpoint.

Exit criteria:

- Demo từ idea đến một Jira Story `verified` không cần credential.
- Double-click approve hoặc retry không tạo duplicate.
- Unit test cover invalid transition, schema rejection, no-write-before-approval.

### M2 - Tldraw-first collaboration and traceability

**Outcome:** PO và agent cùng sáng tạo trên một canvas tự do, sau đó chốt phần cần thiết thành ProductSpec mà không phá business source of truth.

Work:

- Standard tldraw shapes plus semantic metadata for workflows, prototype screens, notes and connections.
- Mỗi thread hydrate đúng một CanvasDocument; inactive canvases được serialize/unmount.
- CanvasService inspect/apply/runScript/read-back with one undo boundary per agent update.
- Selection and enclosing annotation feed bounded context to chat.
- Explicit draw requests receive a deterministic semantic fallback if provider output is absent.
- Promotion preview/confirm synthesizes a validated ProductSpec before artifact planning.

Exit criteria:

- Same Canvas Program produces stable semantic refs and connections.
- Canvas reload không thay ID, mất relationship hoặc tự thêm starter components.
- Thread A/B không rò state/canvas sang nhau; chat và canvas đều phát domain command.
- Test chứng minh raw canvas không mutate ProductSpec trước promotion confirmation.

### M3 - Figma Design System Guard

**Outcome:** tạo được Figma flow/low-fi có kiểm soát và báo cáo compliance.

Work:

- Dùng MCP hiện có để capture DS context từ source root được phép và normalize thành cached `DesignSystemManifest`.
- Tạo semantic `FigmaArtifactPlan` từ ScreenSpec, không chứa tọa độ tự do do LLM sinh.
- Mở rộng MCP với generic recipe, strict zero-write preflight, lifecycle metadata/idempotency và postflight audit.
- Connector bridge thực thi plan đã approve trong file/page sandbox.
- Gắn metadata `runId`, `screenId`, `requirementIds`, `specVersion` vào node.
- Read-back snapshot và `postflight()` verify node, component binding, token/rule compliance.
- Mock Figma connector tương đương để demo offline.

Exit criteria:

- Tạo 4 screen/user-flow nodes cho Balanced option.
- Không có component/token ngoài allowlist trong artifact verified.
- Unknown component làm action fail ở preflight, trước write.
- Retry không tạo duplicate node.

### M4 - Change impact and controlled sync

**Outcome:** signature moment chạy end-to-end.

Work:

- Parse change request thành structured `ChangeIntent`.
- Graph traversal từ `REQ-PAYMENT` sang Screen, Story, Dependency và artifact mapping.
- Before/after ProductSpec diff và impacted action plan.
- Highlight Change view, approval, apply version bump.
- Update Figma projection; update Jira/Zdoc mock; verify ít nhất hai target.
- Partial failure state + retry từng target.

Exit criteria:

- `Bỏ payment khỏi MVP` đánh dấu đúng requirement, payment screen, wallet story/dependency.
- Không thay đổi entity ngoài impact set.
- Cancel approval không mutate ProductSpec hoặc artifact.
- Approved change tăng spec version và hai projections/artifacts được verify.

### M5 - Demo hardening and pitch readiness

**Outcome:** build có thể trình bày ổn định trong thời lượng ngắn.

Work:

- Loading, empty, unavailable, validation, partial failure và retry states.
- History search/resume, provider switch và 500-message/500-shape performance fixture.
- Reset demo data một click/command.
- Record fallback fixture/read receipts để không phụ thuộc mạng.
- Packaging macOS, smoke test trên clean profile.
- Capture screenshots/video backup.
- Rehearse demo theo timebox và khóa feature.

Exit criteria:

- Ba lần chạy demo liên tiếp thành công.
- Có fallback mode được kích hoạt rõ ràng nếu Figma bridge unavailable.
- Không lộ credential/data nhạy cảm trên UI, log hoặc artifact.

## 5. Kế hoạch 10 ngày

| Ngày | Mục tiêu | Deliverable cuối ngày | Gate |
| --- | --- | --- | --- |
| 1 | M0 foundation | Workspace, app shell, thread/provider/domain schema skeleton | `dev`, `test`, `typecheck` chạy |
| 2 | Domain/history core | ProductSpec, RunState, thread/message/canvas persistence | Restart/resume shell pass |
| 3 | M1 workflow | Mock provider stream + lifecycle chat UI | Chọn Balanced và sinh ProductSpec |
| 4 | Provider/action | registry, segment/handoff, approval, mock Jira/Zdoc | Switch Mock segment + no duplicate |
| 5 | M2 canvas | canvas per thread, 4 views, deterministic projection | A/B isolation + delivery map ổn định |
| 6 | M3 guard | Existing MCP adapter, generic recipe, strict preflight | Invalid design plan zero writes |
| 7 | Figma/provider real | Figma sandbox + Codex or API adapter | 4 nodes + one real reasoning provider verified |
| 8 | M4 impact | chat/canvas impact, diff, approved sync | Remove-payment demo pass |
| 9 | Hardening | history resume, provider switch, performance/failure | E2E and performance budgets measured |
| 10 | Packaging/pitch | macOS build, rehearsal, backup media | 3 demo runs pass; scope frozen |

## 6. Critical path

```text
Domain schemas
  -> history/checkpoint + workflow state machine
  -> provider registry/normalized events
  -> deterministic fixture provider
  -> ProductSpec persistence
  -> projection + artifact planner
  -> approval/outbox
  -> connector execute/read-back
  -> impact graph
  -> approved change sync
```

Figma bridge work có thể chạy song song sau khi `FigmaArtifactPlan` và connector interface ổn định. UI polish không được chặn critical path.

OpenAI/Gemini/Anthropic adapters có thể chạy song song sau khi Provider Conformance Kit ổn định. Release gate không chờ đủ mọi adapter nếu Mock + một real provider và safe switching đã được chứng minh.

## 7. Cut order khi thiếu thời gian

Cắt theo đúng thứ tự sau, từ sớm đến muộn:

1. Adapter thật thứ ba/thứ tư; giữ Mock + Codex hoặc một API provider và toàn bộ handoff contract.
2. Zdoc page rendering đầy đủ; giữ PRD preview + mock receipt.
3. Figma low-fi nhiều màn; giữ user flow và 3 màn trọng yếu.
4. Canvas animation/decorative interactions.
5. ProductSpec version browser; vẫn giữ current/previous snapshot cho change diff.

Không cắt: app-owned history/resume, provider abstraction, ProductSpec source of truth, approval, verification, Figma guard, traceability, change impact, offline fallback.

## 8. Definition of Done chung

Một backlog item chỉ `DONE` khi:

- Acceptance criteria được đáp ứng.
- Có test phù hợp với rủi ro hoặc ghi rõ lý do chưa test.
- Error/empty/loading state liên quan đã được xử lý.
- Không phá security/data policy.
- Tài liệu architecture/decision được cập nhật nếu contract thay đổi.
- Bug/fix hoặc caveat đáng nhớ được ghi vào `PROJECT_MEMORY.md`.
