# Multi-Client Routing

`za-talk-to-figma` now distinguishes between:

- **plugin sessions**: live Figma files opened through the plugin
- **client routes**: default active sessions chosen by individual MCP processes

## Defaults

- If a request includes an explicit `sessionId`, that wins.
- Otherwise the runtime tries the route pinned to the calling `clientId`.
- If no client-specific route exists, the runtime falls back to the global active session.

## Sources of route changes

- Plugin UI session switching changes the global active session.
- `/admin` session switching changes the global active session unless a `clientId` is explicitly supplied.
- `set_runtime_session` from an MCP client updates the route for that client process.

## Why this matters

Without client-aware routing, two MCP clients can silently steal each other’s default route. With the current model, global routing still exists for human operators, but MCP processes can keep their own sticky route state.
