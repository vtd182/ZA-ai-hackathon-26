# Decision Log

Mỗi quyết định dùng trạng thái `Proposed`, `Accepted`, `Superseded` hoặc `Rejected`. Quyết định mới thay thế quyết định cũ phải link ID cũ.

## ADR-001 - Positioning theo Workflow Automation Agent

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Định vị PM Lifecycle Agent là agent tự động hóa workflow kickoff và change management cho Product Team trong hệ sinh thái Zalo.
- **Reason:** Khớp trực tiếp track Workflow Automation, đồng thời thể hiện agentic loop, human approval, business impact và technical depth.
- **Consequence:** Demo và fixture phải ưu tiên Zalo OA/Mini App/Bot context; pitch không mô tả đây là PM tool generic.

## ADR-002 - Figma thật, Jira/Zdoc mock trong MVP

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Ưu tiên Figma bridge sandbox làm integration thật; Jira và Zdoc dùng mock adapter cho đến khi vertical slice ổn định.
- **Reason:** Figma tạo bằng chứng trực quan mạnh và cho phép thể hiện Zalo Design System guard. Jira/Zdoc thật tăng setup/risk và có thể vi phạm ràng buộc không dùng production/internal systems.
- **Consequence:** Mock phải giữ connector semantics thật gồm preflight, execute, receipt, read-back, verify, idempotency và failure injection.

## ADR-003 - ProductSpec là source of truth duy nhất

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** ProductSpec lưu business state; tldraw, Figma, Jira và Zdoc là projections/artifacts.
- **Reason:** Cần consistency, traceability và deterministic change impact.
- **Consequence:** Không đọc raw canvas/Figma/Jira như canonical state; external edit chỉ trở thành state sau một reconciliation flow riêng ngoài MVP.

## ADR-004 - Figma guard deterministic

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Model sinh semantic component intent; code resolve manifest, layout và policy checks deterministic.
- **Reason:** Guard cần reproducible, testable và không phụ thuộc chất lượng prompt/pixel output.
- **Consequence:** Không cho LLM sinh absolute coordinates, raw styles hoặc component key không qua manifest resolution.

## ADR-005 - Local-first Electron architecture

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Electron renderer + typed IPC + local core + SQLite, không có central backend cho MVP.
- **Reason:** Phù hợp local credential/tooling, offline demo và scope 10 ngày.
- **Consequence:** Renderer bị giới hạn quyền; migration, crash recovery và packaging macOS là P0.

## ADR-006 - Vertical slice deterministic trước provider thật

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Hoàn thành workflow bằng MockReasoningProvider trước khi nối Codex/provider thật.
- **Reason:** Tách lỗi orchestration/domain khỏi biến động model và runtime.
- **Consequence:** Fixture output phải đủ realistic cho toàn bộ demo và contract provider phải được chốt sớm.

## ADR-007 - Chọn Electron Vite và pnpm workspace

- **Status:** Proposed
- **Date:** 2026-07-22
- **Decision:** Dùng Electron Vite, pnpm workspace, React, TypeScript strict, Zod, Zustand, Vitest và Playwright Electron.
- **Reason:** Bootstrap nhanh, cấu hình renderer/main/preload rõ, phù hợp monorepo TypeScript và hackathon timebox.
- **Validation needed:** Kiểm tra Node version, native SQLite packaging và macOS build trước khi chuyển `Accepted`.

## ADR-008 - SQLite adapter chưa chốt library

- **Status:** Proposed
- **Date:** 2026-07-22
- **Decision:** Domain phụ thuộc repository interface; spike `better-sqlite3` packaging trước, chỉ chốt sau clean-build test.
- **Reason:** Native module packaging là rủi ro lớn hơn khác biệt ORM trong MVP.
- **Consequence:** Không để schema/domain import trực tiếp SQLite library; migration layer nằm trong `persistence`.

## ADR-009 - App-owned history và one-canvas-per-thread

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Mỗi ConversationThread trong history sở hữu đúng một CanvasDocument; mỗi turn tạo checkpoint/version trong thread đó.
- **Reason:** Cho phép resume, isolation giữa nhiều cuộc hội thoại, chat-canvas continuity và undo/version semantics rõ ràng.
- **Consequence:** Provider thread ID và tldraw store không sở hữu history; inactive canvas phải serialize/unmount.

## ADR-010 - Native provider adapters với canonical handoff

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Codex App Server, OpenAI Responses, Gemini Interactions và Anthropic Messages có adapter native; core giao tiếp qua canonical request/event/capability contract.
- **Reason:** Conversation state, streaming, tool use, structured output và retention semantics không tương đương một-một giữa provider.
- **Consequence:** Không dùng OpenAI-compatible API làm abstraction chính; provider-native state chỉ là opaque optimization trong ProviderSegment.

## ADR-011 - Provider switching giữ nguyên app thread

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Switching đóng segment cũ và mở segment mới từ HandoffPackage tại safe checkpoint, trong cùng ConversationThread/CanvasDocument.
- **Reason:** Giữ continuity mà không phụ thuộc hidden reasoning hoặc remote conversation state.
- **Consequence:** Switch bị chặn khi stream/tool write chưa có trạng thái bền vững; paid fallback luôn cần user confirmation.

## ADR-012 - Codex App Server là Codex integration ưu tiên

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Dùng `codex app-server` qua stdio cho rich client integration; không chọn Codex MCP server làm adapter chính.
- **Reason:** App Server hỗ trợ thread/turn/item, resume, approval và streamed agent events phù hợp UI history/chat.
- **Consequence:** Pin supported Codex version, generate schema từ installed CLI và giữ WebSocket experimental ngoài P0.

## ADR-013 - Mở rộng MCP Figma hiện có

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Tái sử dụng `mcp-tool/za-talk-to-figma`; thêm generic recipe, strict zero-write preflight, lifecycle metadata/idempotency và postflight read-back audit.
- **Reason:** Runtime hiện đã có 98 tools, session routing, capability engine và DS capture/apply/audit; thay thế sẽ lãng phí và tăng rủi ro.
- **Consequence:** Giữ backward compatibility tool cũ; approval và business verification tiếp tục thuộc Agent Core.

## ADR-014 - Performance bằng lazy hydration và bounded events

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** Paginate/virtualize history-chat, hydrate một active canvas, batch stream/patch persistence và chạy layout/impact ngoài React hot path.
- **Reason:** Long-running chat và tldraw snapshots có thể gây startup chậm, renderer churn và SQLite write amplification.
- **Consequence:** Performance budgets và 500-message/500-shape fixture là release gate có đo đạc.

## Decision template

```md
## ADR-NNN - Tên quyết định

- **Status:** Proposed
- **Date:** YYYY-MM-DD
- **Decision:** ...
- **Reason:** ...
- **Alternatives:** ...
- **Consequence:** ...
- **Validation needed:** ...
```
