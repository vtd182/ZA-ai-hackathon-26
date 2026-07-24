# MVP Readiness Audit

Audit date: 2026-07-24

This is the current code-versus-acceptance snapshot. `BACKLOG.md` remains the task tracker.

## Verified release slices

- Provider-neutral lifecycle reasoning, safe provider switching and app-owned checkpoints.
- One durable blank-first tldraw canvas per thread, provider-authored Canvas Programs, selection context, Sync receipts and explicit ProductSpec promotion.
- Immutable approval, outbox receipts, independent read-back, partial failure and target-only retry.
- Mock Jira and Mock Zdoc are clearly labeled; Markdown PRD export is real and local.
- Natural-language semantic intent belongs to the provider; deterministic slash routes remain available.
- Live Figma uses a provider-owned Creative Blueprint with arbitrary composition and strict same-file ZDS bindings.
- Connected Figma evidence: 190 copied instances -> 25 semantic bindings, 9 tokens, 4 screens/51 layers, 16 instance-backed controls and 4 prototype edges.
- Approved Figma apply completed in 4.7s, read-back in 0.5s and verified root `489:16542`; a 2248x1024 export was visually reviewed.

## Remaining release work

| Area | Remaining gap |
| --- | --- |
| Demo UX | Replay the final intended hackathon narrative with reminder-backup/ride-booking content and capture clean screenshots/video. |
| API providers | OpenAI/Gemini/Anthropic adapters need live evidence when keys are explicitly configured. |
| Packaging | tldraw production license and packaged macOS rehearsal remain external gates. |
| Visual QA | Content-fit guard is in place, but every final Figma concept still needs human taste review. |
| Jira/Zdoc | Remain labeled mocks by MVP decision; do not pitch them as live writes. |

## Current critical path

1. Rehearse the exact demo script in a clean workspace and export its review bundle.
2. Capture final canvas, approval/progress and Figma artifact visuals.
3. Package only after the tldraw license gate is resolved.

The post-`P0-FIG-008` regression matrix passes: workspace typecheck/build, 144 tests plus one optional skip, 262 plugin tests/typecheck, full Go suite and canvas/semantic/reject smokes. No product-grade Figma blocker remains in code. External credentials, licensing and final rehearsal are the remaining release gates.
