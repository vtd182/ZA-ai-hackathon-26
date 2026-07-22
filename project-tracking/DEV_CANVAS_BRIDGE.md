# Dev Canvas Bridge and Skill

## Purpose

The primary demo remains PO chat -> collaborative canvas -> approved ProductSpec/artifact plan -> verified Figma and mock docs. The secondary developer surface lets Codex or Claude inspect an existing thread and add workflow/prototype diagrams to the same canvas.

## Boundary

```text
Codex / Claude skill
  -> 127.0.0.1 + per-launch bearer token
  -> validated semantic CanvasCommand batch
  -> Electron main dispatch
  -> active renderer + tldraw
  -> debounced CanvasDocument checkpoint
```

The bridge never exposes arbitrary JavaScript, filesystem access, provider credentials, connector calls, approval decisions or direct ProductSpec mutation. ProductSpec-backed shapes continue through guarded domain commands.

## Current API

- `GET /api/threads`: bounded active thread summaries.
- `GET /api/threads/:id/canvas`: thread identity and latest persisted tldraw snapshot.
- `POST /api/threads/:id/commands`: 1-100 validated semantic commands; opens the target thread and applies them on its free canvas.

The descriptor is `~/.pm-lifecycle-agent/canvas-bridge.json`, mode `0600`, and is deleted on clean quit. The server binds only to `127.0.0.1` on an ephemeral port.

## Next hardening

- Persist command inbox and idempotency key before renderer dispatch so commands survive a renderer restart.
- Return apply acknowledgement with canvas checkpoint ID instead of HTTP `202` only.
- Add bounded normalized shape reads instead of requiring agents to inspect raw snapshot records.
- Add screenshot capture and lint endpoints without arbitrary code execution.
- Add explicit user toggle and visible bridge status before packaging.

