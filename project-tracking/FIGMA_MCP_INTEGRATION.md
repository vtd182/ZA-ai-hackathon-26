# Figma MCP Integration Review

## Current implementation - 2026-07-24

The original generic-recipe proposal below remains historical context. The active product-grade path is now:

```text
ProductSpec + bounded live ZDS manifest
  -> provider-owned Creative Figma Blueprint
  -> Agent Core traceability/content-fit validation
  -> MCP strict preflight + connector-native plan hash
  -> immutable approval containing the exact prepared preflight
  -> plugin composition from free primitives + cloned same-file ZDS instances
  -> root-targeted read-back and verification
```

Important current rules:

- Live strict mode never writes synthetic fixture component keys. Failed capture blocks prepare and asks for a DS refresh.
- The public framework page is consumed primarily through copied `INSTANCE` bindings; local component/style/variable capture is supplemental.
- Reads prefer already loaded Figma nodes before network-backed async lookup.
- The provider controls visual composition; required ZDS roles, ProductSpec IDs and external-write policy remain guarded.
- Follower HTTP calls inherit the caller deadline; apply budget is 5-30 minutes and operation-aware.
- The approved payload persists the exact preflight. TypeScript does not recompute a Go-owned hash with a different JSON escaping algorithm.
- Creative idempotency includes the blueprint hash. A dedicated page may be recovered only when it contains one incomplete agent-owned lifecycle root and no rendered screens.
- Content-fit guard limits only compact control copy; long supporting content remains free in primitive text/cards.

Live evidence: 190 ZDS instances -> 25 semantic bindings, 9 tokens, 4 screens, 51 layers, 16 instance-backed controls, 4 prototype edges, 4.7s write, 0.5s read-back and verified root `489:16542`.

## 1. Existing runtime assessment

The repository already contains `mcp-tool/za-talk-to-figma`, a local MCP server and Figma Desktop plugin. It is a strong base and should be extended rather than replaced.

Verified characteristics from source/docs:

- MCP transport is stdio; plugin bridge is local WebSocket.
- No Figma REST token is required.
- Runtime owns capability registry, timeout/fallback policy, execution reports and typed errors.
- Multi-session and client-aware routing are implemented with explicit `sessionId` support.
- Runtime exposes 98 registered tools.
- Existing design-system tools:
  - `capture_design_system_context`
  - `apply_design_system_screen`
  - `audit_design_system_adoption`
- Read/write tools include local components, styles, variables, component instantiation, layout, page and prototype operations.
- Go tests and plugin TypeScript typecheck currently pass in this workspace.
- Plugin serializer contract drift is resolved: 256 tests pass and rich paints remain available for DS audit fidelity.

## 2. Current gaps for PM Lifecycle Agent

### `apply_design_system_screen` is recipe-specific

The current implementation builds a registration-style form with fixed slots such as full name, phone, password and primary button. PM Lifecycle Agent needs generic meal-ordering and future OA/Mini App/Bot recipes.

### Fallback is too permissive for strict compliance

When a component mapping is missing, the workflow creates styled text or primitive frames and reports fallback counts. This is useful in free mode, but a Zalo Design System guard must be able to fail before mutation or mark output non-compliant.

### No lifecycle metadata/idempotency contract

The current tool surface does not expose a dedicated way to attach/read PM lifecycle metadata such as `runId`, `threadId`, `screenId`, `requirementIds`, `specVersion` and `idempotencyKey`.

### Apply mutates before full guard decision

Current DS apply creates the root and descendants, then audits. Hackathon strict mode needs a preflight plan that resolves all required slots before writing.

### Audit is adoption-oriented, not policy-complete

Current audit counts instances, style-bound nodes and primitive fallbacks. It does not yet verify expected screen recipe, required metadata, allowed target, exact component roles, token bindings or expected prototype edges.

## 3. Ownership boundary

### PM Lifecycle Agent Core owns

- ProductSpec and ScreenSpec;
- artifact plan and payload hash;
- target allowlist;
- user approval;
- outbox/idempotency policy;
- action receipts and artifact mappings;
- business verification and change impact.

### Figma MCP runtime owns

- live session/capability discovery;
- reading DS context from the target file;
- resolving and applying Figma-specific operations;
- plugin transport, timeout, progress and fallback execution;
- Figma-side read-back snapshot and DS audit report.

This separation prevents MCP from becoming the product orchestrator.

## 4. Proposed MCP extensions

Keep all existing tool names backward-compatible. Add higher-level tools:

### `plan_design_system_screens`

Read-only preflight.

Input:

```json
{
  "sourceRootNodeId": "1:2",
  "targetPageId": "2:3",
  "mode": "strict",
  "screens": [
    {
      "screenId": "SCR-ORDER-SUMMARY",
      "name": "Order Summary",
      "slots": [
        {"key": "summary", "requiredRoles": ["order-summary"]},
        {"key": "primary-action", "requiredRoles": ["button", "primary"]}
      ]
    }
  ],
  "metadata": {
    "runId": "RUN-001",
    "threadId": "THR-001",
    "specVersion": 1
  },
  "sessionId": "..."
}
```

Output includes resolved components/styles/variables, missing mappings, warnings/errors, deterministic layout recipe, plan hash and estimated operations. It performs no write.

### `apply_design_system_plan`

Write tool accepting a previously produced immutable plan/hash and lifecycle idempotency key. It rejects unknown/expired/mismatched plan hashes and returns created/updated node IDs plus an execution report.

### `read_lifecycle_artifact`

Read back a root node by lifecycle metadata/idempotency key and return a bounded normalized snapshot for app verification.

### `audit_lifecycle_artifact`

Postflight audit against the original plan: instance/role bindings, token/style bindings, metadata, expected edges and primitive fallback policy.

## 5. Strict and free modes

```text
free
  missing component -> allow explicit fallback + warning

strict
  missing required mapping -> preflight error, zero writes
  missing optional mapping -> warning governed by plan policy
  primitive fallback -> verification failure unless explicitly allowlisted
```

The existing `defaultMode` config can be extended, but the mode used for an action must be part of the plan hash and receipt.

## 6. Generic recipe model

Replace hard-coded registration slots in the new workflow with data:

```ts
interface DesignScreenRecipe {
  schemaVersion: number;
  screenId: string;
  name: string;
  purpose: string;
  layout: "vertical" | "horizontal" | "flow";
  slots: DesignSlot[];
  prototypeEdges: PrototypeEdgeIntent[];
}

interface DesignSlot {
  key: string;
  label: string;
  required: boolean;
  requiredRoles: string[];
  preferredRoles?: string[];
  variantProperties?: Record<string, string>;
  content?: Record<string, string>;
  children?: DesignSlot[];
}
```

The MCP runtime resolves this recipe against live components/styles/variables. The LLM does not provide component IDs or absolute coordinates.

## 7. Metadata and idempotency

Preferred implementation is Figma plugin data on root and generated nodes. If plugin data is not available for all target node types, use a namespaced description/annotation fallback and report the storage mode.

Required metadata:

- namespace/version;
- runId and threadId;
- screenId and requirementIds;
- ProductSpec version;
- action ID and idempotency key;
- plan hash;
- generated-at timestamp.

Before create/update:

1. Search the allowed target subtree for idempotency metadata.
2. If exact plan hash exists, return/link it.
3. If key exists with different plan hash, require update semantics or fail conflict.
4. Never create a duplicate silently.

## 8. Performance strategy

- Call `get_runtime_health` once on connect and cache bounded status with event invalidation.
- Pin explicit `sessionId`; do not depend on mutable global route.
- Capture DS context once per source root/session revision and cache by content fingerprint.
- Use compact reads for planning; full subtree read only for postflight of generated roots.
- Batch screen plans and operations to reduce round trips.
- Emit progress per screen/phase through existing execution reports.
- Bound node depth/count/time in every audit/read-back.
- Do not stream full Figma document into app/provider context.

## 9. Failure and recovery

| Failure | App behavior |
| --- | --- |
| Plugin disconnected before apply | Keep approved action queued; retry after health recovery |
| Timeout with no receipt | Query metadata/idempotency before retry |
| Partial apply | Persist returned node IDs/report; read back and mark partial failure |
| Session route changed | Reject mismatch because action pins `sessionId` |
| Plan hash mismatch | Invalidate approval and regenerate preview |
| Postflight mismatch | Show compliance diff; do not mark verified |

## 10. Implementation sequence

1. Resolve `serializePaints` contract/test drift so plugin baseline is green.
2. Add lifecycle metadata read/write capability and tests.
3. Extract generic component-role resolver from existing DS workflow.
4. Implement read-only `plan_design_system_screens`.
5. Implement strict mode with zero-write preflight guarantee.
6. Implement plan-hash/idempotent apply.
7. Implement bounded read-back and postflight audit.
8. Add meal-ordering recipe fixture and end-to-end MCP test.
9. Keep existing registration workflow/tests backward-compatible.

## 11. Verification commands

Verified on 2026-07-23:

```text
cd mcp-tool/za-talk-to-figma && go test ./...
cd mcp-tool/za-talk-to-figma/plugin && bun run typecheck
```

Before changing plugin TypeScript, also run the documented package checks after dependencies are installed:

```text
cd mcp-tool/za-talk-to-figma/plugin
bun run typecheck
bun test
```

Live adapter verification after importing the plugin:

```text
PM_AGENT_FIGMA_LIVE=1 pnpm exec vitest run packages/connectors/src/figma-mcp.live.test.ts
PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke
```

## 12. Implemented connection baseline

`P0-FIG-001` and `P0-FIG-007` are complete:

- official MCP SDK stdio follower; provider/runtime SDK types stay inside the connector;
- typed runtime error mapping and bounded call deadlines;
- exact live session/file/current-page validation before an immutable target hash is allowlisted;
- one active target persisted in SQLite; a changed session/page removes ready state;
- bounded `capture_design_system_context`, normalized deterministic manifest fingerprint and cache reuse;
- raw document/capture payloads are not persisted;
- explicit `fixture_fallback` when the live source has neither usable local components nor copied instances;
- bounded discovery of copied ZDS `INSTANCE` nodes with component properties, nearby labels and ancestor context;
- same-file source bindings, light/default variant selection and strict instance-backed read-back.

The connected public framework duplicate is now treated as a usable allowlisted same-file ZDS catalog. Its ZDS controls are mostly copied external-library instances, so local-component-only scans are insufficient. Synthetic fallback remains available for genuinely empty or unreadable sources, but it is not used by the verified public-framework demo path.

## 13. Current live demo behavior

The complete approved path is now implemented and verified:

1. Agent Core creates a Design Blueprint from the committed ProductSpec: concept, product promise, palette, design principles, screen archetypes, domain content/states and semantic ZDS slots.
2. The app pins an exact live Figma session/file/page and persists the target hash.
3. A bounded capture discovers local definitions plus representative copied ZDS instances and produces semantic source bindings.
4. Strict preflight resolves every recipe slot to an allowlisted component key or same-file instance; unresolved required roles produce zero writes.
5. The user approves the immutable plan hash before the outbox dispatches it.
6. The plugin treats the selected Page as the guarded ZDS source, creates a dedicated `PM · <Product> · vN` output Page, renders the concept brief and product-specific compositions, clones selected ZDS instances, applies business text overrides and creates real prototype reactions.
7. The connector independently reads the artifact across the file by idempotency metadata. Concept and section coverage come from rendered design nodes, while prototype edges come from actual reactions and destinations; audit also checks the output Page, target, plan, screens, requirements, instance type and immutable source binding.

The public framework demo now demonstrates **strict same-file ZDS instance reuse**, not synthetic primitive fallback. It does not claim to publish or mutate the upstream ZDS library; it composes an artifact from copied instances already present on the allowlisted sandbox page.

Performance and hash rules discovered during live verification:

- resolved plan hashes use recursively canonicalized JSON in both Go and TypeScript;
- component/text discovery uses bounded node/time budgets and records an explicit fallback reason when exhausted;
- representative discovery preserves role-relevant component properties while deduplicating the much larger raw instance population;
- catalog scoring prefers light mode, default state, correct button level, large size and no-icon variants;
- lifecycle artifact roots are direct children of dedicated output Pages; idempotency scans only Page children and never traverses the full design tree;
- compositor recipe revisions belong in the idempotency namespace to avoid collisions with artifacts rendered by older recipes;
- Figma is the near-product design realization surface, not a wireframe exporter. ZDS guards controls and interaction consistency, while the Design Blueprint owns product hierarchy, content, states and art direction.

Latest evidence on 2026-07-23:

```text
cd mcp-tool/za-talk-to-figma && go test ./...
cd mcp-tool/za-talk-to-figma/plugin && bun run typecheck && bun test && bun run build
PM_AGENT_FIGMA_LIVE=1 pnpm exec vitest run packages/connectors/src/figma-mcp.live.test.ts
PM_AGENT_FIGMA_LIVE=1 ./run.sh smoke
```

The app smoke completed with live Figma node `449:16909`, strict instance-backed verification, Mock Jira/Mock Zdoc receipts and a generated Markdown PRD.
