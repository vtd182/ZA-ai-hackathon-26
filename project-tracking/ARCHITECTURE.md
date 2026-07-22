# Architecture Baseline

## 1. System context

```text
Electron Renderer (React + tldraw)
             |
       typed IPC only
             |
Electron Main / Local Core
  |              |                 |
SQLite       Provider Registry   Connector Registry
history/run  native adapters      |       |       |
                                  Figma real  Jira mock  Zdoc mock
```

Renderer không được truy cập filesystem, SQLite, secret hoặc connector process trực tiếp. Preload chỉ expose allowlisted typed commands/events.

Developer agents use the guarded loopback Canvas Bridge described in `DEV_CANVAS_BRIDGE.md`. It accepts semantic presentation commands only; arbitrary JavaScript and direct ProductSpec/connector access are not exposed.

## 2. Package boundaries đề xuất

```text
apps/desktop
packages/domain
packages/agent-core
packages/reasoning
packages/connectors
packages/canvas
packages/persistence
packages/shared
fixtures/meal-ordering
fixtures/zalo-design-system
```

| Package | Sở hữu | Không được sở hữu |
| --- | --- | --- |
| `domain` | ProductSpec, RunState types, relationships, change impact rules | React, Electron, connector SDK |
| `agent-core` | Workflow, policies, approvals, outbox, orchestration, verification | UI state, provider-specific protocol |
| `reasoning` | Provider contract, mappers, mock/Codex adapters | Canonical business state |
| `connectors` | Execute/read-back adapter và normalized receipt | Approval decision, business workflow |
| `canvas` | Projection, shapes, domain command translation, layout | ProductSpec persistence |
| `persistence` | Repositories, migration, transaction | Domain decisions |
| `desktop` | UX, IPC composition, lifecycle | Raw secret access trong renderer |

Import direction:

```text
shared <- domain <- agent-core
shared <- connectors <- agent-core
domain <- canvas <- desktop
persistence <- desktop composition root
reasoning <- desktop composition root
```

`domain` và `agent-core` phải test được trong Node mà không khởi động Electron.

Provider/history/canvas detail nằm trong `PROVIDER_ARCHITECTURE.md` và `UI_HISTORY_AND_PERFORMANCE.md`.

## 3. Canonical data flow

```text
User intent
  -> append message to app-owned ConversationThread
  -> Agent Core builds ReasoningRequest from RunState/checkpoint
  -> active ProviderSegment streams normalized events
  -> Provider returns schema-validated proposal
  -> Core applies deterministic domain command
  -> ProductSpec/RunState transaction commits
  -> Canvas and previews project from committed state
  -> User approves PlannedAction
  -> Outbox stores approved action
  -> Connector executes and returns receipt
  -> Connector read-back returns normalized snapshot
  -> Core verifies business invariants
  -> ArtifactMapping and verification status commit
```

Không có bước nào cho phép model hoặc Figma/tldraw trở thành source of truth.

## 4. Contract tối thiểu

### Reasoning provider

```ts
interface ReasoningProvider {
  readonly id: string;
  checkAvailability(): Promise<ProviderStatus>;
  reason(request: ReasoningRequest): Promise<ReasoningResult>;
  cancel(runId: string): Promise<void>;
}
```

Mọi result được parse bằng Zod discriminated union theo `phase` và `schemaVersion`.

Provider SDK types và opaque thread/interaction IDs không được đi qua interface này. Xem `PROVIDER_ARCHITECTURE.md` cho segment/handoff/capability contract.

### Artifact connector

```ts
interface ArtifactConnector<TPlan, TSnapshot> {
  readonly target: "figma" | "jira" | "zdoc";
  checkAvailability(): Promise<ConnectorStatus>;
  preflight(plan: TPlan): Promise<PreflightResult>;
  execute(action: ApprovedAction<TPlan>): Promise<ActionReceipt>;
  readBack(receipt: ActionReceipt): Promise<TSnapshot>;
  verify(plan: TPlan, snapshot: TSnapshot): Promise<VerificationResult>;
}
```

Mock và real adapter phải pass cùng connector contract tests.

### Planned action lifecycle

```text
draft -> pending_approval -> approved -> queued -> executing
      -> completed -> verifying -> verified
      -> failed / verification_failed / cancelled
```

Chỉ action `approved` mới được đưa vào outbox. Approval gắn với payload hash; payload thay đổi làm approval mất hiệu lực.

## 5. Figma as Zalo Design System Guard

### Input model

`DesignSystemManifest` là versioned normalized cache được capture qua MCP từ source root được phép hoặc từ synthetic fixture, gồm:

- component key, semantic role và allowed variants;
- token names cho color, typography, spacing, radius;
- layout constraints và pattern rules;
- deprecated/forbidden aliases;
- manifest version và source timestamp, không chứa credential.

MCP hiện có đã hỗ trợ capture/apply/audit DS context. Hackathon extension cần generic recipe và strict preflight. Nếu source thật không được phép dùng, dùng fixture mô phỏng rõ ràng và ghi `source: fixture`; không tuyên bố compliance với production design system.

### Guard pipeline

```text
ScreenSpec
  -> semantic component intents
  -> resolve against DesignSystemManifest
  -> deterministic layout recipe
  -> preflight policy checks
  -> artifact preview
  -> user approval
  -> Figma connector execute
  -> read-back node snapshot
  -> postflight compliance checks
  -> verified artifact mapping
```

Preflight phải chặn:

- unknown/deprecated component;
- raw color/font/spacing thay vì token;
- missing required state/variant;
- node thiếu requirement metadata;
- target file/page không thuộc sandbox allowlist;
- plan/schema version không được hỗ trợ.

Postflight phải verify:

- node tồn tại và thuộc đúng page;
- `runId`, `screenId`, `requirementIds`, `specVersion` đúng;
- component instance/key và token binding đúng;
- expected node count/flow edges đúng;
- không có forbidden raw style.

Model không sinh absolute x/y. Layout recipe nhận semantic hierarchy và tính frame/spacing deterministic.

## 6. Jira và Zdoc mock fidelity

Mock không chỉ trả `success: true`. Mỗi mock connector cần:

- in-memory hoặc SQLite-backed external store riêng với canonical state;
- deterministic IDs như `MOCK-JIRA-101`, `MOCK-ZDOC-201`;
- search/read-back API;
- idempotency lookup theo key;
- configurable latency, unavailable và partial failure;
- action receipt với target, external ID, payload hash, timestamp;
- verification dùng snapshot read-back, không dùng execute response.

Nhờ vậy connector thật có thể thay vào mà không đổi orchestration/UI.

## 7. Persistence model

P0 tables tối thiểu:

- `projects`
- `conversation_threads`
- `turns`
- `messages`
- `message_parts`
- `provider_segments`
- `provider_events`
- `canvas_documents`
- `canvas_snapshots`
- `canvas_patches`
- `thread_checkpoints`
- `runs`
- `product_spec_versions`
- `domain_events`
- `planned_actions`
- `approvals`
- `outbox`
- `action_receipts`
- `artifact_mappings`
- `connector_snapshots`

History list/message queries phải paginated; chỉ hydrate CanvasDocument của active thread. Xem performance budgets trong `UI_HISTORY_AND_PERFORMANCE.md`.

Transaction boundaries:

- Domain command + ProductSpec version + events commit cùng transaction.
- Approval + payload hash + outbox insert commit cùng transaction.
- Receipt lưu trước verification để retry/recover sau crash.
- Verification update không xóa receipt cũ.

## 8. Change impact algorithm

1. Parse request thành `ChangeIntent` có target entity, operation và reason.
2. Resolve target bằng exact ID trước, semantic match sau; ambiguity phải hỏi user.
3. Traverse relationships `IMPLEMENTS`, `DESIGNED_BY`, `DEPENDS_ON`, `AFFECTS`.
4. Tạo immutable impact set và before/after ProductSpec snapshot.
5. Sinh target-specific planned actions từ diff.
6. Preview và approve bằng payload hash.
7. Commit ProductSpec version mới.
8. Execute từng target; partial failure không rollback external success.
9. Verify và hiển thị trạng thái theo artifact.

P0 dùng deterministic graph traversal. LLM chỉ giúp parse/semantic resolve và giải thích.

## 9. Security and competition constraints

- Chỉ dùng fixture, sandbox file/page/project và dữ liệu synthetic.
- Không kết nối production Jira/Zdoc; mock phải hiển thị nhãn `Mock` rõ ràng.
- Figma target phải nằm trong explicit allowlist.
- Secret lưu Keychain hoặc process environment cho dev; không ghi SQLite/log/source.
- Renderer dùng context isolation; không expose arbitrary shell/file access.
- Log redaction cho token, authorization header, email, phone và user identifier.
- Write cần approval; delete/destructive action ngoài MVP.

## 10. Failure semantics

| Failure | Trạng thái | Recovery |
| --- | --- | --- |
| Provider unavailable | `TOOL_UNAVAILABLE` | Chạy deterministic fixture mode |
| Schema invalid | `FAILED_VALIDATION` | Không mutate state; log metadata đã redact |
| Connector unavailable trước execute | `QUEUED` | Retry từ outbox |
| Crash sau external write | `VERIFYING` | Dùng receipt/idempotency search rồi read-back |
| Một target fail khi change sync | `PARTIAL_FAILURE` | Giữ target thành công, retry target fail |
| Verification mismatch | `VERIFICATION_FAILED` | Hiển thị diff; không tự tuyên bố thành công |
