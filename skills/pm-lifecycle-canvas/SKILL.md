---
name: pm-lifecycle-canvas
description: Inspect PM Lifecycle Agent threads and draw semantic workflows or prototypes on the active tldraw canvas through the guarded local Canvas Bridge.
---

# PM Lifecycle canvas collaborator

Use this skill when a developer or product owner asks Codex/Claude to inspect or draw on the PM Lifecycle Agent canvas.

## Bridge

The desktop app writes an ephemeral descriptor to `~/.pm-lifecycle-agent/canvas-bridge.json`. It contains a per-launch loopback port and bearer token and is removed on clean quit.

Use the helper from this skill directory. It reloads the descriptor for every request:

```bash
./pm-canvas.sh GET /api/threads
./pm-canvas.sh GET /api/threads/THREAD_ID/canvas
./pm-canvas.sh POST /api/threads/THREAD_ID/commands '{"commands":[...]}'
```

## Semantic commands

Create nodes first, then connect them in the same batch:

```json
{
  "commands": [
    { "type": "create_canvas_node", "nodeId": "request", "label": "Nhận yêu cầu", "nodeKind": "process" },
    { "type": "create_canvas_node", "nodeId": "valid", "label": "Đủ dữ liệu?", "nodeKind": "decision" },
    { "type": "connect_canvas_nodes", "fromId": "request", "toId": "valid", "label": "phân tích" }
  ]
}
```

Allowed `nodeKind` values are `note`, `process`, `decision`, and `screen`. Keep `nodeId` stable across edits so a follow-up updates the same visual object. A batch can contain at most 100 commands.

## Boundaries

- This bridge controls free canvas presentation only. It does not mutate ProductSpec.
- ProductSpec-backed shapes remain guarded; deletion creates a change proposal in the app.
- Never call Figma, Jira, Zdoc, filesystem, or shell through canvas commands.
- Do not edit SQLite or tldraw snapshots directly.
- Read the target thread before drawing and verify by reading its canvas again after the app saves it.

