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

## ADR-003 - ProductSpec là business source of truth

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision:** ProductSpec lưu business state đã được xác nhận; CanvasDocument lưu creative visual state trước và sau promotion. Figma, Jira và Zdoc là guarded artifacts.
- **Reason:** Cần consistency, traceability và deterministic change impact.
- **Consequence:** Agent được đọc và sửa raw canvas như một workspace sáng tạo, nhưng canvas chỉ trở thành business state qua promotion preview + confirmation. External edits vẫn cần reconciliation riêng.

## ADR-015 - Tldraw-first collaboration and Canvas Program tools

- **Status:** Accepted
- **Date:** 2026-07-23
- **Decision:** Primary surface là một infinite tldraw canvas không có lifecycle tabs. Provider hoặc developer agent thao tác qua application-owned `inspect -> apply/runScript -> readBack` tools; lifecycle chỉ tồn tại trong RunState/timeline.
- **Reason:** Workflow, prototype, sketch và vùng feedback không cùng một schema cố định. Canvas cần giữ tính sáng tạo của tldraw trong khi business promotion và external writes vẫn có guard rõ ràng.
- **Consequence:** Presentation writes có thể auto-apply và undo; ProductSpec promotion cần confirmation; scripts chạy trong bounded virtual runtime không có filesystem/network/IPC; explicit draw intent có deterministic fallback để demo không phụ thuộc model output.

## ADR-016 - Application-owned canvas intent and receipt-confirmed chat

- **Status:** Accepted
- **Date:** 2026-07-23
- **Decision:** Agent Core routes each message as conversation, draw, scoped edit, ambiguous edit or promotion before consuming provider actions. Canvas success messages require a matching request ID, durable snapshot save and normalized read-back receipt.
- **Reason:** A provider can over-eagerly draw or misclassify Vietnamese text, while renderer execution can fail or outpace debounced persistence. Neither condition may produce a false “đã cập nhật canvas” response.
- **Consequence:** Provider Canvas Programs are ignored for non-canvas intents; vague edits require selection or an identified node; renderer persists before acknowledgement; the final assistant outcome reports verified node/connection counts. Explicit selection/region sync remains a follow-up UX control, not a second source of canvas truth.

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

## ADR-015 - Scene-aware canvas layout and verification

- **Status:** Accepted
- **Date:** 2026-07-23
- **Decision:** Provider và deterministic planner chỉ mô tả semantic nodes/edges; canvas layer sở hữu generated coordinates, stable-ID reconciliation, collision avoidance, graph arrangement, camera fit và visual lint.
- **Reason:** tldraw là creative scene, không chỉ là renderer. Model-owned coordinates gây overlap, layer drift và output khó đọc; tool success cũng không chứng minh scene usable.
- **Alternatives:** Giữ hardcoded grid; cho model sinh absolute coordinates; dùng raw tldraw snapshot làm reasoning contract.
- **Consequence:** Dagre xử lý graph nhỏ/local edit; graph lớn dùng topology-derived wrapped journey và exception lanes. Canvas context phải mang bindings, viewport/selection geometry, recent changes và lint. Actionable lint chặn success receipt, trong khi developer scripts vẫn có thể dùng explicit coordinates có chủ ý.
- **Validation:** 101 tests + 1 optional live skip, workspace typecheck, full `smoke-canvas-agent` and reviewed 2880x1740 flow screenshot.

## ADR-016 - Delivery continuation and prototypes are app-owned projections

- **Status:** Accepted
- **Date:** 2026-07-23
- **Decision:** Canonical RunState determines which continuation UI is active. After decision, the app exposes explicit Delivery actions; prototype intent maps to semantic screen nodes rendered as editable tldraw frame compositions.
- **Reason:** Provider prose alone left users without an observable next step, while treating prototypes as workflow boxes discarded the creative and bidirectional value of the canvas.
- **Alternatives:** Keep continuation entirely in free chat; encode prototype visuals as provider-authored JavaScript; treat every screen as one generic geo node.
- **Consequence:** Custom answers and decisions cross an app-owned validated boundary. Renderer owns frame composition, coordinates and visual lint; provider/planner owns semantic screen intent. Prototype canvas output remains exploratory and distinct from approved strict-guard Figma generation.
- **Validation:** 105 tests + 1 optional live skip, workspace typecheck, production build and `smoke-lifecycle` with custom inputs, visible Delivery guide, 5 frames, 35 editable children and durable receipt.

## ADR-017 - Canvas presentation, chat context and ProductSpec promotion are separate boundaries

- **Status:** Accepted
- **Date:** 2026-07-23
- **Decision:** Direct tldraw edits mutate only the CanvasDocument and mark it dirty. Explicit Sync first checkpoints the exact snapshot, then sends bounded canvas and selection context into chat without changing ProductSpec. Only semantic shapes with both `semanticId` and `nodeKind` may enter an explicit ProductSpec promotion preview.
- **Reason:** A creative prototype contains labels, chrome, cards and annotations that are useful for collaboration but are not business requirements. Treating every visual element as domain state contaminates ProductSpec; silently reading every pointer change also creates cost, latency and unpredictable agent behavior.
- **Alternatives:** Automatically invoke the provider after every edit; promote every shape carrying metadata; keep canvas and chat entirely disconnected.
- **Consequence:** The user controls when manual work becomes reasoning context, can address a selected region directly, and sees a dirty/synced state. Scene furniture remains editable and inspectable but is excluded from business promotion. Future automatic sync may be added as a deliberate mode over the same checkpoint contract.
- **Validation:** 106 tests + 1 optional live skip, workspace typecheck, production build and `smoke-lifecycle` proving pointer edit -> dirty state -> selected feedback -> Sync receipt while ProductSpec remains v1.

## ADR-018 - Creative authority belongs to the provider; execution authority belongs to Agent Core

- **Status:** Accepted
- **Date:** 2026-07-24
- **Decision:** The provider authors conversational prose and rich semantic scene content. Agent Core decides whether a proposed canvas mutation may execute, while the renderer translates validated scene intent into safe tldraw primitives. Deterministic scene planning is an offline fallback and never a completeness oracle.
- **Reason:** Comparing provider output against hard-coded labels and rendering domain UI from renderer lookup tables suppressed model creativity and produced generic workflows/prototypes. The security boundary is permission to mutate, not restriction of what the provider may propose.
- **Alternatives:** unrestricted editor JavaScript from providers; renderer-owned product templates; deterministic planner augmentation of every provider result.
- **Consequence:** Canvas Programs gain richer authored content while remaining bounded and undoable. Explicit draw/edit requests can auto-apply locally; ordinary chat stays non-mutating. ProductSpec promotion and Figma/Jira/Zdoc writes retain explicit approval and verification.
- **Validation needed:** reminder-backup chat -> provider/fallback scene -> manual edit and typed Sync -> prototype -> promotion happy path in a production Electron build.

## ADR-019 - Explicit slash routing and size-aware Figma execution budgets

- **Status:** Accepted
- **Date:** 2026-07-24
- **Decision:** Keep natural-language intent as a convenience layer, while slash commands provide deterministic app-owned routing for Figma lifecycle actions and canvas scene types. Figma apply uses a five-minute minimum plus five seconds per estimated operation, capped at 30 minutes; heartbeat inactivity is tracked separately from the total client budget.
- **Reason:** Natural language is useful but can be ambiguous, and a fixed 120-second timeout underbudgets large multi-screen design work. A longer unbounded timeout would hide stalls rather than distinguish slow progress from no progress.
- **Alternatives:** slash-only interaction; provider-only intent inference; one fixed large timeout; no total timeout while heartbeats continue.
- **Consequence:** `/figma prepare|approve|create|status|retry` and `/canvas flow|prototype` bypass provider guessing without bypassing immutable approval. Plan size and timeout budget become inspectable payload metadata; the bridge can tolerate legitimate long work while the client still enforces a finite ceiling.
- **Validation:** parser/timeout tests, 132 workspace tests, Go policy tests, rebuilt runtime/plugin, regular Electron smoke with slash discovery/status routing and full lifecycle smoke.

## ADR-020 - Provider-owned semantic intent, Agent Core-owned execution policy

- **Status:** Accepted
- **Date:** 2026-07-24
- **Decision:** Natural-language requests are classified by every reasoning provider into a typed `conversation | discovery | draw | edit | promote | change | artifact` intent. Application code no longer accent-folds or keyword-matches Vietnamese to decide those actions. Agent Core validates targets, state transitions, approval and execution. Slash commands remain deterministic direct routes.
- **Reason:** Accent folding collapsed distinct Vietnamese words such as `đổi`, `đối` and `dõi`; maintaining keyword cases duplicated LLM semantic understanding and produced unrelated canvas responses during Discovery.
- **Alternatives:** continue expanding regex exceptions; always send the full Canvas Program schema; trust provider output to execute without policy validation.
- **Consequence:** Ordinary turns use a small route schema. Natural `draw/edit` takes a route response followed by a rich creative response; `/canvas flow|prototype` goes directly to creative mode. Edit still requires selection or a uniquely resolved target, and artifact writes still require immutable approval.
- **Validation:** domain/provider intent contracts, accent-safe target resolution, workspace typecheck/tests, lifecycle smoke and Mock canvas-agent smoke.

## ADR-021 - Provider owns Figma composition; Agent Core guards the artifact contract

- **Status:** Accepted
- **Date:** 2026-07-24
- **Decision:** The reasoning provider authors a Creative Figma Blueprint with art direction, arbitrary nested composition, product copy, primitives, ZDS control roles and prototype edges. Agent Core guards ProductSpec traceability, the exact allowlisted session/page, live component bindings, immutable approval, idempotency and independent read-back. The plugin executes the approved blueprint; it is not the product designer.
- **Reason:** A deterministic screen compositor generated generic wireframes in one or two seconds and suppressed the same model creativity that produced good results through direct Codex + Figma MCP use. Security and compliance require control of target, business scope and external writes, not hard-coded visual templates.
- **Alternatives:** fixed recipe renderer; unrestricted provider JavaScript; provider-direct Figma writes; synthetic DS fallback in live strict mode.
- **Consequence:** Primitives and custom composition are first-class, while required interaction controls must resolve to live same-file ZDS instances. A failed live capture blocks strict preparation instead of silently writing fixture components. Prepared preflight is persisted with the approved payload; connector-native plan hash is validated by its own runtime. Blueprint-derived idempotency permits creative revisions, and only incomplete agent-owned pages may be recovered.
- **Validation:** live capture produced 25 semantic bindings from 190 ZDS instances; Codex produced 4 screens/51 layers; Figma write/read-back verified in 5.2s with 16 instance-backed controls and 4 prototype edges. A 2248x1024 artifact export was visually reviewed.

## ADR-022 - Importable PM Agent skill packs

- **Status:** Accepted
- **Date:** 2026-07-26
- **Decision:** Follow the tldraw Desktop Agent Skills pattern for future PM Lifecycle extensibility: package canvas/Figma/domain guidance as importable skill packs containing prompt instructions, recipes, validators, helper scripts and optional MCP/app tool scopes.
- **Reason:** Hard-coding taste rules and workflow recipes in Agent Core makes the product feel constrained. Importable skills let the demo switch between Zalo Mini App, OA, Bot, growth experiment or engineering review behavior without changing core policy.
- **Alternatives:** bake every prompt into the desktop app; let providers use arbitrary external tools; keep skills only as local repo docs.
- **Consequence:** Skills may shape reasoning and provide validators, but Agent Core still owns routing, permission, immutable approvals, target allowlists, execution and read-back verification. Imported skills cannot silently grant Figma/Jira/Zdoc write access.
- **Validation needed:** add a Skill Pack registry UI/runtime that lists installed PM skills, records the selected pack per thread/provider segment and includes its version/hash in approvals and exported review bundles.

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
