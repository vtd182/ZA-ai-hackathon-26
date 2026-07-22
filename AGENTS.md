# AGENTS.md

This file contains durable repository guidance for coding agents. Keep it concise and update it only when a rule should apply across future sessions.

## Read first

Before implementation work, read in this order:

1. `project-tracking/PROJECT_MEMORY.md`
2. `project-tracking/README.md`
3. The active item in `project-tracking/BACKLOG.md`
4. Relevant architecture document under `project-tracking/`
5. `PM_LIFECYCLE_AGENT_SPEC.md` for full product context

If these conflict, follow the source-of-truth order in `project-tracking/README.md`.

## Working protocol

- Before coding, mark exactly one relevant backlog item `IN_PROGRESS` and record the current task in project memory.
- Prefer a complete vertical slice with tests over parallel half-built layers.
- After verified work, mark the task `DONE` with evidence and update project memory.
- Record recurring bugs with symptom, root cause, fix, regression test and caveat.
- Do not invent commands in project memory. Add a command only after it succeeds in this workspace.
- Preserve user changes and unrelated files. This workspace may contain nested repositories.

## Product invariants

- ProductSpec is the business source of truth.
- SQLite is the local execution/history/checkpoint store.
- The reasoning provider proposes structured actions; Agent Core owns state, policy, approval, execution, retry and verification.
- tldraw and Figma are projections. Neither is a business database.
- Every conversation thread owns exactly one canvas document. Turns create canvas checkpoints, not new canvases.
- Chat and direct canvas gestures both emit validated domain commands.
- Every external write requires approval tied to an immutable payload hash.
- Tool success is not verification. Verify with read-back state.
- Provider switching occurs only at safe checkpoints using a canonical handoff package.
- Never depend on provider-native hidden state for resume or switching.

## Provider rules

- Keep provider SDK types inside provider adapters.
- Normalize streaming into internal `ProviderEvent` types before UI/core consumption.
- Capability-detect features; do not infer them from provider or model names.
- Use provider-native APIs rather than an OpenAI-compatible facade when native semantics matter.
- Keep provider/model IDs in configuration and persisted segment metadata, not domain enums.
- A provider change starts a new ProviderSegment in the same conversation.
- Do not auto-fallback to a paid provider or API key. Ask for explicit user approval.
- A provider tool call is a proposal to Agent Core. Providers never call Figma/Jira/Zdoc directly.

See `project-tracking/PROVIDER_ARCHITECTURE.md`.

## UI and performance rules

- The primary work surface is history sidebar + canvas + chat/inspector, with responsive panel collapse.
- Load one active thread/canvas at a time; inactive canvases stay serialized.
- Paginate and virtualize chat/history. Do not load an entire project timeline into renderer state.
- Batch stream updates and canvas persistence. Never write SQLite on every token or pointer move.
- Run graph impact, layout and large serialization outside the React render path.
- UI renders canonical state/events, not raw provider payloads.
- Keep layout dimensions stable and prevent text/control overlap at demo viewports.

See `project-tracking/UI_HISTORY_AND_PERFORMANCE.md`.

## Figma MCP rules

- The existing runtime lives at `mcp-tool/za-talk-to-figma` and is its own codebase; inspect its local status before editing.
- Reuse its runtime, capability registry, typed error contract, session routing and design-system workflows.
- Approval, ProductSpec mapping and artifact verification remain in PM Lifecycle Agent Core.
- Hackathon extensions should add generic recipe input, strict guard mode, metadata/idempotency and read-back support without breaking existing tool names.
- In strict mode, missing DS mappings are errors; primitive fallback must not silently pass compliance.
- Run Go tests and plugin typecheck/tests after MCP changes.
- Baseline has `BUG-001`: plugin `bun test` currently has 9 stale `serializePaints` contract failures. Resolve `P0-FIG-000` before judging new MCP regressions.

See `project-tracking/FIGMA_MCP_INTEGRATION.md`.

## Security and data

- Use only synthetic, sanitized or explicitly allowed sandbox data.
- Never store secrets in source, SQLite plaintext, logs, project memory or exported projects.
- Keep credentials in macOS Keychain or supported provider/runtime auth stores.
- Do not read or copy provider session tokens.
- Keep Figma target session/page on an explicit allowlist.
- Jira and Zdoc remain clearly labeled mocks for the MVP.

## Verification

The app has not been bootstrapped yet, so no app commands are authoritative. Once verified, record them in `project-tracking/PROJECT_MEMORY.md`. For the existing Figma MCP, use its documented Go and plugin checks.
