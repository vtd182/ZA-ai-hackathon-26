# Product Sharpening Audit

Last updated: 2026-07-30

This file is the coordination brief for product-sharpening work. Any AI agent joining this
workstream should read this file before changing chat, ProductSpec, canvas, Figma, prompt or
artifact execution behavior.

## 1. Product Goal

DualMind / PM Lifecycle Agent is not a general chatbot and not a Figma shape generator.

It is a governed co-creation workspace for PMs and product designers:

```text
ambiguous or clear product input
  -> shared exploration in chat/canvas when useful
  -> explicit Draft ProductSpec
  -> user-confirmed ProductSpec source of truth
  -> approved ArtifactBriefs
  -> controlled Figma/docs/backlog execution
  -> read-back verification
  -> safe change-impact synchronization
```

The useful promise is:

> Turn product thinking into reviewable visual work and verified downstream artifacts, then keep
> those artifacts consistent when scope changes.

The product wins when the user feels:

- "The agent understands the product problem, not just my sentence."
- "I can see and correct thinking on the canvas."
- "I know what has been confirmed versus what is still exploratory."
- "Figma/docs/backlog were really created, verified and tied to the same spec."
- "When I change scope, it knows exactly what is affected."

## 2. Differentiator Versus A Normal Agent

A normal agent can brainstorm, write a PRD, draw in Figma if connected and call tools.

This product must be different in workflow ownership:

| Normal agent | PM Lifecycle Agent |
| --- | --- |
| Chat output is the working memory | SQLite checkpoints plus ProductSpec/canvas version streams are working memory |
| Tool calls are direct model actions | Provider proposes; Agent Core validates, approves, executes and verifies |
| Figma output can drift from docs | Figma/docs/backlog derive from the same ProductSpec and ArtifactBrief |
| Scope changes cause rewrites | Scope changes produce impact preview and targeted sync |
| Canvas is optional decoration | Canvas is a shared visual thinking surface with selection/sync/read-back |
| "Done" means tool returned success | "Done" means receipt plus read-back verification |

The key differentiator is not model quality. It is the governed loop:

```text
co-create -> confirm truth -> materialize -> verify -> change safely
```

## 3. ProductSpec Definition

ProductSpec is the confirmed business source of truth for synchronization. It is not:

- the full chat transcript;
- the canvas;
- the PRD document;
- the Figma file;
- every exploratory thought.

Current schema lives in `packages/domain/src/product-spec.ts`.

Current contents:

- `idea`: title, summary, product type, target users.
- `goals`: measurable product goals.
- `findings`: evidence or assumptions.
- `requirements`: scoped product capabilities with AC and status.
- `screens`: product surfaces mapped to requirements.
- `stories`: development slices mapped to requirements.
- `dependencies`: internal/external/platform dependency refs.
- `decisions`: accepted/rejected product decisions.
- `relationships`: traceability graph.
- `artifactMappings`: Figma/Jira/Zdoc sync state.

Target mental model:

```text
Conversation = thinking in progress
Canvas       = visual thinking / editable sketch
DraftSpec    = structured extraction, still reviewable
ProductSpec  = user-confirmed truth used for external writes
Artifact     = materialized view of ProductSpec, verified after write
```

### Clear Input Path

If the user starts with a clear brief, the agent must not force a three-question Discovery flow.

Example:

```text
"Tôi cần admin web dashboard quản lý booking nội bộ cho ops. Có sidebar, bảng booking realtime,
filter theo trạng thái, màn xử lý exception, phân quyền admin/staff. MVP chưa cần analytics."
```

Expected path:

```text
clear brief
  -> extract Draft ProductSpec immediately
  -> show concise ProductSpec preview
  -> ask for confirm/edit/draw/artifact next step
```

Only ask clarification questions when they block scope, risk or artifact quality. Ask the missing
thing, not a fixed count.

### Ambiguous Input Path

If the user starts vague:

```text
"Tôi muốn làm miniapp đặt xe"
```

Expected path:

```text
vague idea
  -> product conversation: hypothesis, risk, PM framing
  -> optional canvas sketch if requested
  -> targeted clarification only for missing critical decisions
  -> Draft ProductSpec when enough is known
```

## 4. Target Demo Narrative

The demo should prove value that a normal agent struggles to guarantee:

```text
1. User: "Tôi muốn làm web dashboard quản lý booking nội bộ cho ops..."
2. Agent recognizes clear brief and creates Draft ProductSpec, not generic questions.
3. User asks for flow.
4. Canvas renders workflow with exception/retry paths.
5. User selects/circles exception area and asks to refine it.
6. Agent updates only that region and summarizes what changed.
7. User confirms ProductSpec.
8. User chooses Figma "Không dùng ZDS" for adaptive web design.
9. Agent creates desktop Figma artifact, runs screenshot QA/audit/read-back.
10. User says "bỏ manual approval khỏi MVP".
11. Agent shows impact preview, asks approval, syncs only affected artifacts.
```

Signature moment:

> A product change becomes an impact set, not a rewrite.

## 5. Current Audit

### What Is Working

- Thread history, canvas ownership and SQLite checkpointing exist.
- Canvas can be blank-first and supports explicit draw/edit/promote flows.
- ProductSpec has schema, version and traceability relationships.
- Artifact execution has approval, outbox, receipt, read-back and verification.
- Figma has ZDS/reference mode and no-ZDS/free mode.
- No-ZDS now supports adaptive surface intent in prompts/scaffold/audit.
- Jira/Zdoc mocks are labeled and contract-backed.

### What Is Not Yet Sharp

1. ProductSpec is invisible in the user experience.

The system has a ProductSpec, but users do not clearly see when conversation/canvas becomes
DraftSpec or confirmed ProductSpec. This makes the core source-of-truth promise feel vague.

2. Clear input still risks being routed through lifecycle ceremony.

The agent should detect when a brief is already rich enough and skip generic Discovery. Current
logic still has legacy phase pressure and mock/provider route heuristics.

3. Prompt ownership is fragmented.

Figma behavior is shaped by:

- `packages/reasoning/src/index.ts` system and Figma policies;
- `apps/desktop/src/main/figma-design-worker.ts` worker prompt;
- `skills/pm-lifecycle-figma-design/*`;
- connector preflight/audit rules;
- deterministic scaffold fallback.

This fragmentation causes contradictory instructions and repeated fixes.

4. ArtifactBrief is missing as a canonical contract.

Mode, surface, fidelity, output page policy and DS policy are inferred in multiple places. They
should be normalized once before provider/worker/connector execution.

5. ProductSpec schema is too Mini App/ZDS biased.

`productType` only supports `mini_app | oa | bot`, and every screen requires
`designSystemRoles`. Free web/admin/landing mode has to ignore these fields instead of modeling
them cleanly.

6. Canvas value is present but under-explained.

The canvas should be the shared thinking surface, not just an output preview. UI and chat responses
should make selection/sync/refine/promotion obvious.

7. Figma quality depends too much on worker availability.

When the craft worker is unavailable, scaffold/compositor output can look simplistic. The app must
label this honestly and avoid pretending scaffold equals product-grade design.

8. Progress messages are better but still not product-readable enough.

Users need to know:

- what stage is running;
- whether AI is thinking, drawing, writing or verifying;
- whether it is mobile/ZDS or free/adaptive;
- what will happen after approval.

## 6. Product Principles For Fixes

1. Do not optimize for "agent answered". Optimize for "product state advanced".
2. Do not force lifecycle ceremony when the user's brief is already clear.
3. Never hide the truth boundary. Draft is draft; confirmed is confirmed; external write is verified or failed.
4. Canvas is for thinking and feedback. ProductSpec is for committed business truth.
5. Figma is a materialized design artifact, not the database.
6. ZDS guard and no-ZDS creative freedom are separate modes.
7. Prompt complexity must move into typed briefs and validators, not more prose pasted everywhere.
8. Every important claim in chat should point to state, canvas, ProductSpec, artifact receipt or read-back.

## 7. Proposed Architecture Target

### Add ProductBrief / ArtifactBrief Layer

Introduce an intermediate canonical brief before ProductSpec/artifact execution.

```ts
interface ProductBrief {
  schemaVersion: 1
  clarity: 'clear' | 'partial' | 'ambiguous'
  userGoal: string
  targetUsers: string[]
  productSurface: 'mini_app' | 'oa' | 'bot' | 'web_app' | 'admin_dashboard' | 'landing_page' | 'desktop_tool' | 'adaptive'
  mvpScope: string[]
  outOfScope: string[]
  risks: string[]
  missingCriticalInputs: string[]
  confidence: number
}

interface ArtifactBrief {
  schemaVersion: 1
  sourceSpecVersion: number
  target: 'figma' | 'jira' | 'zdoc'
  mode: 'zds_reference' | 'free_adaptive' | 'mock'
  surface: ProductBrief['productSurface']
  fidelity: 'flow' | 'wireframe' | 'product_grade'
  outputPolicy: 'selected_page' | 'managed_page'
  designSystemPolicy: 'required' | 'reference' | 'none'
  verificationPolicy: string[]
}
```

Intent:

- ProductBrief decides whether to ask questions or draft a spec.
- ProductSpec is created from a confirmed ProductBrief plus canvas/decisions.
- ArtifactBrief drives prompts, scaffold, Figma worker and audit.
- Providers receive a brief, not scattered repo assumptions.

## 8. Task Cards

### `P0-SHARP-001` Define clear-brief extraction path

- **Owner area:** `packages/reasoning`, `apps/desktop/src/main`, `packages/agent-core`.
- **Goal:** Rich user input creates Draft ProductSpec preview directly.
- **Implementation direction:** Add a small structured route result or app-owned detector for `ProductBrief.clarity`. Use provider semantic output for live providers; Mock gets deterministic fixtures.
- **Acceptance:** A web-dashboard brief produces Draft ProductSpec preview without fixed three-question Discovery.
- **Tests:** route result parsing, clear brief fixture, renderer preview state.
- **Status note 2026-07-30:** app-owned v1 implemented in `packages/agent-core/src/product-spec-synthesis.ts`
  and `apps/desktop/src/main/index.ts`. It detects clear briefs before provider routing, replaces an
  empty draft ProductSpec, switches to Delivery, and returns next-action suggestions. Remaining
  polish: provider-assisted extraction for nuanced briefs and a richer edit/review UX.

### `P0-SHARP-002` Make ProductSpec visible and confirmable

- **Owner area:** renderer + lifecycle state.
- **Goal:** User sees Draft ProductSpec before artifacts.
- **Implementation direction:** Add ProductSpec review panel: Goal, Users, MVP Scope, Out of Scope, Screens/Surfaces, Risks, Decisions.
- **Acceptance:** User can choose `Chốt ProductSpec`, `Sửa`, `Vẽ flow trước`, or `Tạo artifact`.
- **Tests:** UI smoke for clear brief -> DraftSpec -> confirm.
- **Status note 2026-07-30:** first UI polish implemented in `apps/desktop/src/renderer/src/App.tsx`:
  Draft ProductSpec is labeled as source-of-truth state, Delivery copy explains writes still require
  approval, and web/admin/no-ZDS surface is displayed from `FINDING-PRODUCT-SURFACE`. Remaining
  polish: explicit edit controls beyond the current inspector + delivery actions.
- **Status note 2026-07-30 update:** ProductSpec confirmation is now an explicit checkpoint:
  `/spec confirm` and the Delivery UI button mark a Draft ProductSpec as `approved`, persist the
  same ProductSpec version, and block Figma/PRD/backlog artifact planning until this confirmation
  happens.

### `P0-SHARP-003` Introduce ArtifactBrief canonical contract

- **Owner area:** `packages/domain`, `apps/desktop/src/main`, `packages/connectors`.
- **Goal:** Figma mode/surface/fidelity/output policy is decided once and reused everywhere.
- **Implementation direction:** Create `artifact-brief.ts`; build from ProductSpec + Figma setup; include payload hash.
- **Acceptance:** Figma provider prompt, scaffold, worker and audit all read the same ArtifactBrief.
- **Tests:** ZDS Mini App brief and no-ZDS web brief produce different, deterministic policies.

### `P0-SHARP-004` Split prompt packs by task

- **Owner area:** `packages/reasoning`, `skills/pm-lifecycle-*`.
- **Goal:** Remove contradictory mega-prompt behavior.
- **Implementation direction:** Separate route/chat, canvas draw/edit, ProductSpec extraction, Figma ZDS craft and Figma free adaptive craft.
- **Acceptance:** No single prompt contains both "always mobile 390x844" and "adaptive web" instructions.
- **Tests:** snapshot important prompt sections or unit-test prompt builders.

### `P0-SHARP-005` Relax ProductSpec schema surface bias

- **Owner area:** `packages/domain`, synthesis, artifact planning.
- **Goal:** ProductSpec can model web/admin/landing without fake Mini App/ZDS roles.
- **Implementation direction:** Extend `productType`; add `surface` or `screen.surface`; make `designSystemRoles` optional or policy-driven in v2 schema.
- **Acceptance:** A web dashboard ProductSpec parses without fake ZDS roles.
- **Tests:** invariant tests for web/admin specs and backward compatibility for v1.

### `P0-SHARP-006` Improve progress and failure language

- **Owner area:** main + renderer.
- **Goal:** User sees what is happening and why.
- **Implementation direction:** Normalize progress stage labels around ProductBrief/ProductSpec/ArtifactBrief/Execute/Verify.
- **Acceptance:** No chat says "done" before read-back; errors mention the failing contract and next action.
- **Tests:** partial failure fixtures and progress event assertions.

### `P0-SHARP-007` Demo script and rehearsal matrix

- **Owner area:** docs + smoke tests.
- **Goal:** One crisp demo path and one fallback path.
- **Implementation direction:** Script clear-input web dashboard path plus ZDS Mini App path. Include expected screenshots/log exports.
- **Acceptance:** Demo can run in timebox with deterministic fallback if provider/Figma worker is unavailable.
- **Tests:** smoke for clear brief, canvas refine, ProductSpec confirm, no-ZDS Figma prepare.

### `P0-SHARP-008` Context Budgeter and task context packs

- **Owner area:** `packages/reasoning`, `apps/desktop/src/main`, prompt tests.
- **Goal:** Avoid sending every context/skill into every chat turn, especially for AgentRouter.
- **Implementation direction:** Introduce a central `ContextBuilder` that emits small task-specific packs:
  `route/chat`, `canvas-draw`, `canvas-edit`, `sync-selection`, `product-spec`, `figma-zds`,
  `figma-free`, and `artifact-verify`.
- **Acceptance:** Normal chat sends only core policy, thread summary and last few messages; canvas read-back is attached only for draw/edit/sync; Figma skill pack is attached only to Figma craft worker.
- **Tests:** prompt budget tests assert max payload sizes and absence/presence of Figma skill/canvas dumps by response mode.

### `P0-SHARP-009` AgentRouter managed Codex bridge

- **Owner area:** `packages/reasoning`, `apps/desktop/src/main`, Figma craft worker.
- **Goal:** Use Codex app-server as the AgentRouter transport without mutating the user's personal
  `~/.codex`, while still preserving remote thread/cache state across app turns and Figma craft
  repair passes.
- **Implementation direction:** Keep Codex Local on the user's normal login/config. For AgentRouter,
  create an app-managed `CODEX_HOME` under app user data, write only provider config there, inject
  `AGENT_ROUTER_TOKEN` via env, persist `remoteRef`, and route Figma craft worker through the same
  managed home when the active thread provider is AgentRouter.
- **Acceptance:** AgentRouter chat returns a persisted `remoteRef`; subsequent turns resume it.
  Figma craft payloads on an AgentRouter thread use `craftProvider: agentrouter` and the managed
  Codex home. No API key is written to TOML or project files.
- **Tests:** unit test verifies managed AgentRouter Codex config generation without secrets; provider
  smoke can be run with `PM_AGENT_AGENTROUTER_LIVE=1`.

## 9. Prompt Audit Checklist

When editing any prompt:

- Is this task chat, canvas, ProductSpec, Figma ZDS, Figma free, or audit?
- Does the prompt mention only the contracts relevant to that task?
- Does it receive typed state instead of inferring from prose?
- Does it avoid claiming external writes?
- Does it tell the model what to do with clear input versus ambiguous input?
- Does it avoid fixed mobile/ZDS assumptions in free mode?
- Does it keep output schema small enough for the task?
- Is there a regression test for the prompt branch?
- Is the task using the smallest relevant context pack instead of the whole thread/canvas/skill set?

## 10. Definition Of Done For Product Sharpness

This workstream is done when:

- The app can explain ProductSpec in-product and show what is draft/confirmed.
- A clear brief skips generic discovery and produces a reviewable Draft ProductSpec.
- Canvas remains optional but valuable: draw/refine/sync/promote are obvious.
- Figma ZDS and Figma no-ZDS produce visibly different, intentional behaviors.
- Artifact execution uses ArtifactBrief and is still approval/read-back verified.
- A normal user can understand what the agent is doing from progress and chat.
- The demo narrative in Section 4 can be rehearsed end to end.
