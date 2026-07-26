---
name: pm-lifecycle-canvas
description: Inspect PM Lifecycle Agent threads and draw semantic workflows or prototypes on the active tldraw canvas through the guarded local Canvas Bridge.
---
<!-- installed-by:pm-lifecycle-agent -->

# PM Lifecycle canvas collaborator

Use this skill when a developer or product owner asks Codex/Claude to inspect or draw on the PM Lifecycle Agent canvas.

## Bridge

The desktop app writes an ephemeral descriptor to `~/.pm-lifecycle-agent/canvas-bridge.json`. It contains a per-launch loopback port and bearer token and is removed on clean quit. If that file is absent, the app is not running — start it before drawing.

A ready-made helper ships with this skill and re-reads the descriptor (port + token) on every call, so you never handle the token yourself. **Each Bash call runs in a fresh shell, so always invoke the helper by its absolute path** — do not rely on the current working directory:

```bash
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET  /api/threads
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET  /api/threads/THREAD_ID/canvas
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" POST /api/threads/THREAD_ID/programs '{"program":{...}}'
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" POST /api/threads/THREAD_ID/scripts '{"script":"canvas.node(...)"}'
```

When running from a checkout of the repository instead of the installed copy, call `./pm-canvas.sh` from this skill directory; both resolve the same descriptor.

## Canvas programs

Create nodes first, then connect them in the same batch:

```json
{
  "program": {
    "schemaVersion": 1,
    "mode": "operations",
    "summary": "Request validation flow",
    "script": null,
    "operations": [
      { "op": "create_node", "id": "request", "label": "Nhận yêu cầu", "kind": "process" },
      { "op": "create_node", "id": "valid", "label": "Đủ dữ liệu?", "kind": "decision" },
      { "op": "connect", "id": "request-valid", "fromId": "request", "toId": "valid", "label": "phân tích" }
    ]
  }
}
```

Allowed kinds are `note`, `process`, `decision`, and `screen`. Keep IDs stable so a follow-up updates the same visual object. A program can contain at most 200 operations.

Omit coordinates for normal workflows. The app will arrange the semantic graph, avoid occupied user content and keep local edits near their referenced node. Use explicit coordinates only when spatial placement itself is intentional; developer-source positions are preserved.

For generated layouts, use the virtual script API. It intentionally accepts only direct `canvas.node/connect/update/remove` calls, not loops, imports or arbitrary JavaScript:

```js
canvas.node("register", "Đăng ký", "screen")
canvas.node("verify", "Xác thực", "screen")
canvas.connect("register-verify", "register", "verify")
canvas.update("verify", {"color":"blue"})
```

The response is an apply/read-back receipt with visual lint evidence. Treat HTTP `202` as queued, not verified. Before reporting completion, inspect again and confirm there are no overlap or dangling-edge errors.

## Boundaries

- This bridge controls free canvas presentation only. It does not mutate ProductSpec.
- ProductSpec promotion and every external artifact write remain guarded in the app.
- The script worker has no network, filesystem, Node, Electron IPC or connector capability.
- Do not edit SQLite or tldraw snapshots directly.
- Read the target thread before drawing and verify by reading its canvas again after the app saves it.
