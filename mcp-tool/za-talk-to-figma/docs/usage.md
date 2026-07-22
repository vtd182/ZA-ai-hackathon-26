# Using za-talk-to-figma with MCP clients

`za-talk-to-figma` is an MCP (Model Context Protocol) server. Any MCP-compatible
client can drive a live Figma file through it. This guide covers setup for
**Claude**, **Codex**, **Antigravity**, and **any other MCP client**, plus the
runtime configuration, the diagnostics tools, and the typed error contract.

> The server talks to Figma through a plugin running in **Figma Desktop** — not
> the Figma REST API. There are no API tokens and no REST rate limits.

---

## 1. Prerequisites

1. **Figma Desktop** (the plugin cannot run in the browser app).
2. **Node.js ≥ 18** (the `npx` launcher downloads the right native binary for
   your platform).
3. The **ZA Talk To Figma plugin** loaded in Figma:
   - Build it (`make build-ts`) or grab `plugin.zip` from a release.
   - In Figma Desktop: **Plugins → Development → Import plugin from manifest…**
     and select `plugin/manifest.json`.
   - Run the plugin inside any Figma file. It connects to `ws://127.0.0.1:1802`
     by default; the host/port are configurable from the plugin's console.

The MCP server and the plugin find each other automatically over the local
WebSocket bridge. Start order does not matter — whichever comes up first waits
for the other.

---

## 2. Connect your client

The invocation is the same everywhere — `npx -y za-talk-to-figma` over stdio.
Only the config file/format differs per client.

### Claude Code (CLI)

```bash
claude mcp add za-talk-to-figma -- npx -y za-talk-to-figma
```

Project-scoped (writes `.mcp.json` in the repo so teammates inherit it):

```bash
claude mcp add -s project za-talk-to-figma -- npx -y za-talk-to-figma
```

Verify: `claude mcp list` should show `za-talk-to-figma: connected`.

### Claude Desktop

Edit `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "za-talk-to-figma": {
      "command": "npx",
      "args": ["-y", "za-talk-to-figma"]
    }
  }
}
```

Restart Claude Desktop. The tools appear under the 🔌 (MCP) menu.

### Codex (OpenAI Codex CLI)

Codex reads MCP servers from `~/.codex/config.toml`:

```toml
[mcp_servers.za-talk-to-figma]
command = "npx"
args = ["-y", "za-talk-to-figma"]

# Optional environment (see §3)
[mcp_servers.za-talk-to-figma.env]
ZA_LOG_LEVEL = "info"
```

Or add it non-interactively:

```bash
codex mcp add za-talk-to-figma -- npx -y za-talk-to-figma
```

### Antigravity (Google)

Antigravity manages MCP servers from its settings UI (**Settings → MCP /
Manage MCP servers → Edit config**), which writes an `mcpServers` JSON block:

```json
{
  "mcpServers": {
    "za-talk-to-figma": {
      "command": "npx",
      "args": ["-y", "za-talk-to-figma"]
    }
  }
}
```

After saving, refresh the MCP server list in Antigravity; the za-talk-to-figma
tools become available to the agent. (On Windows, if `npx` is not found, use the
full path to `npx.cmd` or wrap with `cmd /c npx -y za-talk-to-figma`.)

### Cursor / VS Code (GitHub Copilot) / any MCP client

These read a JSON MCP config — `.cursor/mcp.json`, `.vscode/mcp.json`, or a
generic `.mcp.json`:

```json
{
  "mcpServers": {
    "za-talk-to-figma": {
      "command": "npx",
      "args": ["-y", "za-talk-to-figma"]
    }
  }
}
```

Any client that speaks MCP over stdio works with this same shape. The only hard
requirement is that the client launch the command and connect over **stdio**.

---

## 3. Configuration

### Flags

Pass flags after the package name (the npx launcher forwards them to the binary):

| Flag     | Default     | Purpose |
|----------|-------------|---------|
| `--port` | `1802`      | Port for the plugin WebSocket bridge + `/admin` control plane. |
| `--ip`   | `127.0.0.1` | Bind address. Use `0.0.0.0` only deliberately — there is no auth. |

```json
{
  "mcpServers": {
    "za-talk-to-figma": {
      "command": "npx",
      "args": ["-y", "za-talk-to-figma", "--port", "1802"]
    }
  }
}
```

### Environment variables

| Variable        | Values                         | Default | Purpose |
|-----------------|--------------------------------|---------|---------|
| `ZA_LOG_LEVEL`  | `debug` `info` `warn` `error`  | `info`  | Log verbosity. Per-request traces live at `debug`; set `warn` in production to keep only warnings and errors. |
| `ZA_LOG_FORMAT` | `text` `json`                  | `text`  | `json` for log pipelines/ingestion; `text` is friendlier locally. |

All logs go to **stderr** (stdout is reserved for the MCP protocol), so they
never corrupt the transport and your client can capture them separately.

### Runtime config file (optional)

A `za-talk-to-figma.json` in the working directory tunes playbook behavior:

```json
{
  "defaultMode": "free",
  "allowPromptModeOverride": false,
  "generatedRoot": "generated"
}
```

### Control plane

With the server running, open **http://127.0.0.1:1802/admin** for a live view of
sessions, routes, and the recent event stream. The same data is available over
MCP via `get_recent_events` (see below).

---

## 4. Diagnostics tools

These two tools inspect the **runtime itself** and do not round-trip to Figma, so
they work even when no plugin is connected — exactly when you need them.

### `get_runtime_health`

Returns a snapshot of runtime state:

| Field             | Meaning |
|-------------------|---------|
| `role`            | `LEADER`, `FOLLOWER`, or `UNKNOWN`. Multiple clients elect one leader that owns the bridge. |
| `version`         | Running server version. |
| `pluginConnected` | Whether a Figma plugin is attached. If `false`, open/run the plugin. |
| `activeSession`   | The Figma file/session tool calls currently route to. |
| `sessionCount`    | Number of connected Figma sessions. |
| `pendingCount`    | In-flight requests waiting on the plugin. |
| `logLevel`        | Effective `ZA_LOG_LEVEL`. |
| `leaderReachable` | (Follower) whether the leader process answered. |

**Call this first** when a tool returns `PLUGIN_NOT_CONNECTED` or `TIMEOUT` to
confirm whether the plugin is attached and the runtime is healthy.

### `get_recent_events`

Returns the runtime event stream — execution reports (capability, duration,
result class, fallback usage), session announcements/switches, and reloads —
the same data the `/admin` page shows, exposed over MCP. Optional `limit`
(default 40, max 120). Use it to debug slow or failing calls without a browser.

---

## 5. Error contract

Tool failures return a typed JSON envelope so clients can branch on a stable
`code` instead of parsing prose:

```json
{ "error": { "code": "TIMEOUT", "message": "request timed out — …", "retryable": true } }
```

| Code                   | Meaning | Retryable | What to do |
|------------------------|---------|-----------|------------|
| `PLUGIN_NOT_CONNECTED` | No Figma plugin attached. | yes | Open and run the plugin in Figma, then retry. |
| `TIMEOUT`              | Plugin did not respond in time (usually a heavy read). | yes | Retry with tighter `depth` / `maxNodes` / `maxTimeMs`, or use `get_design_context`. |
| `CANCELED`             | Caller canceled before completion. | no | — |
| `TRANSPORT_ERROR`      | WebSocket/RPC channel failed mid-message. | yes | Retry; check the runtime with `get_runtime_health`. |
| `PLUGIN_ERROR`         | Plugin received the request but reported a domain error (e.g. node not found). | no | Fix the arguments (e.g. a bad nodeId). |
| `VALIDATION_ERROR`     | Request rejected before execution (bad arguments). | no | Fix the arguments. |
| `INTERNAL_ERROR`       | Unexpected server-side failure. | no | Check logs (`ZA_LOG_LEVEL=debug`). |

---

## 6. Verify the setup

1. Start your client so the MCP server launches.
2. Open and run the plugin in a Figma file.
3. Ask the model to call **`get_runtime_health`**. You want:
   `pluginConnected: true` and a non-empty `activeSession`.
4. Ask it to call **`get_metadata`** — it should return the file name and pages.

If `get_runtime_health` shows `pluginConnected: false`, the plugin is not
running or is pointed at a different port — check the plugin console's host/port
against your `--port` flag.
