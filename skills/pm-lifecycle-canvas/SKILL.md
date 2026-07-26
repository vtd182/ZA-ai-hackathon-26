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

## Scripting with real JavaScript

`POST /api/threads/THREAD_ID/scripts` now runs **real JavaScript** in a sandboxed
main-process VM and compiles whatever your code builds into canvas operations — so generate
scenes programmatically with loops, variables, functions and `Math`. The sandbox exposes only
a `canvas` builder plus pure computation (`Math`, `JSON`, `Array`, `Object`, `Number`,
`String`, …); there is no `require`, `process`, `fetch`, filesystem, network or Electron
access, and the only effect is the operations it emits (≤ 200 per run, ~1.5s budget).

The `canvas` builder:

```js
canvas.node(id, label, kind = "process", opts?)   // opts: { x, y, tone, color, badge, lane, icon, description }
canvas.connect(id, fromId, toId, label?)
canvas.update(id, opts)                            // { label?, color? }
canvas.remove(id)
```

Example — a generated grid of steps (this is exactly the creative freedom to use):

```js
const cols = 4
for (let i = 0; i < 12; i++) {
  const tone = i % 3 === 0 ? "brand" : i % 3 === 1 ? "success" : "warning"
  canvas.node("step-" + i, "Bước " + (i + 1), "process", {
    x: (i % cols) * 300,
    y: Math.floor(i / cols) * 220,
    tone,
  })
  if (i % cols !== 0) canvas.connect("edge-" + i, "step-" + (i - 1), "step-" + i)
}
```

Allowed `kind`: `note`, `process`, `decision`, `screen`. Keep IDs stable so a rerun updates
the same object. Prefer omitting `x`/`y` to let the app auto-arrange; set them only when
spatial placement is intentional.

### Free-form primitives (unlimited composition)

Beyond semantic nodes, draw arbitrary shapes at exact coordinates. These are
presentation-only (they never promote into ProductSpec):

```js
canvas.rect(id, x, y, w, h, opts?)          // opts: { color, fill, dash, size, rotation, opacity, text }
canvas.ellipse(id, x, y, w, h, opts?)
canvas.text(id, x, y, "Nội dung", opts?)    // opts: { color, size, w, rotation, opacity }
canvas.line(id, x, y, x2, y2, opts?)
canvas.arrow(id, x, y, x2, y2, opts?)
canvas.shape(kind, id, x, y, opts?)         // kind: rectangle|ellipse|triangle|diamond|star|hexagon|rhombus
```

- `color`: `black|grey|blue|green|yellow|red|violet|orange` (+ `light-*`). `fill`:
  `none|solid|semi|pattern`. `size`: `s|m|l|xl`. `dash`: `draw|solid|dashed|dotted`.
- Combine with real JS for generative art, custom layouts, charts, dashboards — anything.

```js
// Bar chart from data, drawn with primitives
const data = [40, 90, 60, 120, 75]
data.forEach((v, i) => {
  canvas.rect("bar-" + i, i * 70, 200 - v, 48, v, { color: "blue", fill: "solid" })
  canvas.text("val-" + i, i * 70 + 8, 210 - v - 22, String(v), { size: "s", color: "black" })
})
```

The response is an apply/read-back receipt with visual lint evidence. Treat HTTP `202` as
queued, not verified. Before reporting completion, inspect again and confirm there are no
overlap or dangling-edge errors.

## Boundaries

- This bridge controls free canvas presentation only. It does not mutate ProductSpec.
- ProductSpec promotion and every external artifact write remain guarded in the app.
- Script JavaScript runs sandboxed: no network, filesystem, Node, Electron IPC or connector capability.
- Do not edit SQLite or tldraw snapshots directly.
- Read the target thread before drawing and verify by reading its canvas again after the app saves it.
