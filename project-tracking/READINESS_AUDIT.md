# MVP Readiness Audit

Audit date: 2026-07-22

This file records implementation evidence versus the P0 acceptance criteria. `BACKLOG.md` remains the task tracker; this audit explains why partially built work is not marked done.

## Verified complete

- Repository foundation and package boundaries.
- Versioned ProductSpec/domain schemas, invariants, workflow transitions and deterministic payment impact graph.
- Immutable approval payload hashing and atomic ProductSpec v2 approval commit.
- Typed Electron IPC shell and runnable tldraw workspace.
- Native Codex App Server adapter with a real smoke pass.
- Figma runtime setup, explicit session/page allowlist, bounded DS capture, normalized cache and labeled fixture fallback.

## Implemented but below P0 acceptance

| Area | Existing evidence | Remaining acceptance gap |
| --- | --- | --- |
| Fixtures | Deterministic meal-ordering and DS fixtures | Repeatable reset plus seeded Jira/Zdoc stores |
| Agent | Provider contract, registry, mock and signature change path | Phase-specific orchestration, normalized stream events and conformance |
| Persistence | Threads, messages, segments, canvas, runs, specs, actions, approvals and checkpoints | Migration ledger, turns/events, outbox, receipts and mappings |
| Provider switching | Provider/profile changes keep app-owned state | Canonical handoff, safe-checkpoint guard and paid-provider confirmation |
| History | Search, archive, capped messages and one active canvas | Cursor pagination, FTS5, virtualization and 500-message test |
| Canvas | Deterministic ProductSpec projection and chat commands | Edges/custom contract and guarded gesture commands |
| Approval UI | Readable before/after and immutable approve | Reject/cancel and per-target execution/verification status |
| Change flow | Exact five-entity payment preview and atomic v2 commit | Ambiguity handling, reject path and connector execution |
| API providers | Native OpenAI/Gemini/Anthropic implementations | Release-slot selection, streaming/usage conformance and live evidence |

## Not yet implemented

- Semantic Figma recipe planner and strict zero-write preflight.
- Approved Figma apply, lifecycle metadata/idempotency and independent read-back audit.
- Realistic Mock Jira and Mock Zdoc connectors.
- Receipt-first outbox execution, partial failure and target-only retry.
- Full discovery/decision UI flow.
- Deterministic demo reset, Electron E2E recovery suite and packaged clean-profile rehearsal.

## Critical path

1. Build semantic artifact contracts and connector conformance kit.
2. Complete Figma strict preflight/apply/read-back plus offline parity.
3. Add Mock Jira/Zdoc and receipt-first outbox orchestration.
4. Wire execution, verification, retry and reset into the desktop UI.
5. Close provider/history gaps required by the demo and run quality/recovery gates.

Only one backlog item is active: `P0-FIG-002`.
