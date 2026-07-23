# Dev Canvas Bridge and Skill

## Purpose

The primary demo remains PO chat -> collaborative canvas -> approved ProductSpec/artifact plan -> verified Figma and mock docs. The secondary developer surface lets Codex or Claude inspect an existing thread and add workflow/prototype diagrams to the same canvas.

## Boundary

```text
Codex / Claude skill
  -> 127.0.0.1 + per-launch bearer token
  -> inspect / apply operations / run virtual script
  -> Electron main validates and dispatches
  -> active renderer CanvasService + tldraw
  -> normalized read-back + CanvasDocument checkpoint
```

The bridge accepts a bounded JavaScript-call subset only for `canvas.node/connect/update/remove`. A worker interprets these calls without `eval`/`Function` and has no filesystem, network, Node, Electron IPC, provider credentials, connector calls, approval decisions or direct ProductSpec mutation. ProductSpec promotion and artifact writes stay in Agent Core.

## Current API

- `GET /api/threads`: bounded active thread summaries.
- `GET /api/threads/:id/canvas`: bounded normalized canvas context; raw snapshot is available only in explicit diagnostic mode.
- `POST /api/threads/:id/programs`: validated operation program; opens the target thread, applies one undoable transaction and returns an execution acknowledgement/read-back receipt.
- `POST /api/threads/:id/scripts`: bounded virtual-API script with timeout and operation limit; returns the same receipt contract.
- `POST /api/threads/:id/commands`: compatibility alias while older skills migrate to programs.

The descriptor is `~/.pm-lifecycle-agent/canvas-bridge.json`, mode `0600`, and is deleted on clean quit. The server binds only to `127.0.0.1` on an ephemeral port.

## Next hardening

- Persist program inbox and idempotency key before renderer dispatch so work survives a renderer restart.
- Add region screenshot capture and visual lint endpoints.
- Add explicit user toggle and visible bridge status before packaging.
