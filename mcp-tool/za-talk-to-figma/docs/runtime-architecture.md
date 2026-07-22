# Runtime Architecture

`za-talk-to-figma` is evolving from a thin bridge into a layered Figma execution runtime.

## Runtime domains

1. `control`
   - election
   - leader/follower lifecycle
   - health checks
   - process role transitions

2. `transport`
   - websocket bridge
   - follower RPC
   - request/response wire types
   - plugin connection lifecycle

3. `events`
   - shared runtime event schema
   - bounded event buffer
   - execution reports
   - session and route telemetry

4. `execution`
   - capability registry
   - execution engine
   - timeout policy
   - fallback policy
   - progress semantics

5. `capabilities`
   - read
   - write
   - export
   - generate
   - audit/review utilities

6. `plugin runtime`
   - typed request dispatch
   - read/write handlers
   - progress emission
   - UI event stream

7. `control plane`
   - `/admin`
   - `/admin/overview`
   - `/admin/events`
   - route switching for operators

## Execution model

Every MCP tool should map to a `Capability`.

Each capability declares:
- name
- kind
- execution profile
- default timeout
- progress support
- fallback support
- optional fallback capability

Handlers should stop calling `Node.Send()` directly over time.
Instead they should call the `ExecutionEngine`, which is responsible for:
- applying default timeouts
- centralizing fallback behavior
- preserving future room for retries, cancellation, and telemetry

## Migration path

### Phase 1
- introduce `Runtime`
- introduce `CapabilityRegistry`
- introduce `ExecutionEngine`
- route read/generate/export plumbing through the engine
- keep wire protocol and plugin behavior stable

### Phase 2
- migrate remaining write handlers to engine-backed helper wrappers
- add structured execution reports and per-profile metrics
- reduce boilerplate in tool registration

### Current direction
- keep the plugin UI as a compact **session console**
- move runtime-wide inspection and route control into the `/admin` control plane
- add client-aware routing on top of the existing multi-session bridge
- keep the same event stream reusable across plugin logs and `/admin`

## Design constraints

- current MCP tool names must continue to work
- plugin protocol should remain backward-compatible during migration
- safe-read behavior should remain one of the runtime's strongest differentiators
- new architecture should make future features look native instead of appended
