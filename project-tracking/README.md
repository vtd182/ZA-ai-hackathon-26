# PM Lifecycle Agent - Implementation Control Center

Thư mục này là nơi điều phối quá trình triển khai. Product/technical intent đầy đủ vẫn nằm trong
[`../PM_LIFECYCLE_AGENT_SPEC.md`](../PM_LIFECYCLE_AGENT_SPEC.md); các file ở đây biến spec thành kế hoạch có thể thực thi và theo dõi.

## Product framing đã chốt

**PM Lifecycle Agent** là Workflow Automation Agent cho Product Team trong hệ sinh thái Zalo. Agent biến một ý tưởng Zalo OA/Mini App/Bot thành ProductSpec, PRD preview, Figma flow tuân thủ Zalo Design System và Jira backlog nhất quán; khi scope đổi, agent chỉ ra tác động, xin duyệt và đồng bộ các artifact.

MVP dùng:

- Figma integration thật hoặc bridge sandbox, có Zalo Design System guard.
- Jira và Zdoc mock, nhưng giữ nguyên connector contract, approval, receipt và read-back verification.
- Dữ liệu fixture/sandbox đã được làm sạch; không dùng production system, customer data, PII hoặc tài liệu nội bộ nhạy cảm.
- ProductSpec là business source of truth; SQLite là execution memory.

## Cách dùng thư mục này

| File | Vai trò | Khi nào cập nhật |
| --- | --- | --- |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Roadmap, sequence, exit criteria | Khi đổi scope, phase hoặc thứ tự triển khai |
| [BACKLOG.md](BACKLOG.md) | Ticket triển khai và acceptance criteria | Trong mỗi phiên coding |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Boundary, contract và luồng dữ liệu | Khi thay đổi kiến trúc/interface |
| [PROVIDER_ARCHITECTURE.md](PROVIDER_ARCHITECTURE.md) | Provider adapters, switching, handoff và conformance | Khi thêm/sửa provider hoặc model runtime |
| [UI_HISTORY_AND_PERFORMANCE.md](UI_HISTORY_AND_PERFORMANCE.md) | History, resume, chat-canvas và performance budgets | Khi đổi interaction model hoặc persistence hot path |
| [FIGMA_MCP_INTEGRATION.md](FIGMA_MCP_INTEGRATION.md) | Review và kế hoạch mở rộng MCP Figma hiện có | Khi sửa connector/MCP/plugin Figma |
| [TEST_AND_DEMO_PLAN.md](TEST_AND_DEMO_PLAN.md) | Test matrix, demo script, fallback | Khi thêm behavior hoặc sửa demo |
| [READINESS_AUDIT.md](READINESS_AUDIT.md) | Evidence map và khoảng trống P0 thực tế | Sau mỗi completion audit lớn |
| [DECISIONS.md](DECISIONS.md) | Quyết định kiến trúc/sản phẩm đã chốt | Trước hoặc ngay sau quyết định quan trọng |
| [PROJECT_MEMORY.md](PROJECT_MEMORY.md) | Memory ngắn hạn dài hạn, bug/fix, lưu ý | Cuối mỗi phiên implementation |

## Thứ tự nguồn sự thật

Khi có mâu thuẫn, áp dụng thứ tự sau:

1. Yêu cầu mới nhất đã được người dùng xác nhận.
2. `DECISIONS.md` với trạng thái `Accepted`.
3. `PM_LIFECYCLE_AGENT_SPEC.md`.
4. `IMPLEMENTATION_PLAN.md` và `ARCHITECTURE.md`.
5. `BACKLOG.md`.

Không sửa một quyết định nền tảng chỉ bằng cách cập nhật backlog. Hãy ghi decision record trước.

## Trạng thái hiện tại

- **Current milestone:** M2 - Guarded artifact execution and demo readiness.
- **Current vertical slice:** Approved ProductSpec change -> strict Figma/mock plans -> outbox execute -> independent read-back verify -> partial retry.
- **Demo differentiator:** Change request `Bỏ payment khỏi MVP` cập nhật traceability và Figma projection có kiểm soát.
- **Integration policy:** Figma first; Jira/Zdoc mock until demo flow is stable.
- **Provider policy:** App-owned history/checkpoint; provider segments có thể đổi tại safe checkpoint.

## Quy ước cập nhật

- Backlog status chỉ dùng: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CUT`.
- Mỗi task hoàn thành phải có evidence: test, screenshot, receipt hoặc đường dẫn file.
- Mỗi bug đáng nhớ phải được thêm vào `PROJECT_MEMORY.md` với symptom, root cause, fix và regression test.
- Không ghi secret, token, PII, chain-of-thought hoặc raw customer/internal data vào bất kỳ file tracking nào.
