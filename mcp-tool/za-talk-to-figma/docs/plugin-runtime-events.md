# Plugin Runtime Events

The plugin runtime now uses typed request, response, and UI event contracts in `plugin/src/protocol.ts`.

## Request flow

1. UI bridge receives a server frame over WebSocket.
2. UI forwards a typed `server-request` payload to the plugin runtime.
3. The plugin runtime validates the payload shape before dispatch.
4. Read/write handler registries process the request.
5. A typed tool response is posted back to the UI bridge.
6. The UI bridge announces session metadata back to the runtime transport.

## Lifecycle events

The plugin runtime also emits typed UI events:

- `plugin-status`
  - session id
  - file name
  - page name
  - selection count

- `request_event`
  - `start`
  - `success`
  - `error`

- `progress_update`
  - request id
  - progress
  - message

- `ws_config`
  - host
  - port

- `execution_report`
  - request id
  - capability
  - profile
  - attempts
  - result class
  - fallback path

## Why this matters

This is not just a TypeScript cleanup.

Typed runtime events make it easier to:

- keep progress tracking stable
- keep operation timelines tied to real execution semantics
- route runtime work by active Figma session
- reduce `any`-driven drift between the runtime and UI
- make the plugin feel like a real execution runtime instead of a loose bridge script
