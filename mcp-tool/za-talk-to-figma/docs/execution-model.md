# Execution Model

`za-talk-to-figma` now treats tool execution as a runtime concern instead of a thin bridge concern.

## Layers

1. `Node`
   - still owns leader/follower routing
   - still owns plugin transport reachability
   - now tracks active runtime session selection

2. `CapabilityRegistry`
   - describes each capability by `kind`, `profile`, timeout, and fallback support

3. `ExecutionEngine`
   - injects default timeouts
   - retries heavy reads with compact parameters
   - falls back to alternate capabilities when declared
   - emits structured execution reports
   - publishes execution reports back to the Runtime Console

4. `MCP tool handlers`
   - should call the engine instead of calling `Node.Send()` directly
   - should expose structured smart workflows instead of only raw bridge tools

## Result classes

Every execution report resolves to one of:

- `complete`
- `partial`
- `fallback`
- `failed`

This lets the runtime tell the difference between:

- a normal success
- a success that required degradation
- a partial read with truncation
- a hard failure

## Smart workflows

The runtime now exposes smart capabilities that sit above raw tool calls:

- `inspect_selection_safely`
- `review_canvas_layout`
- `cleanup_board_layout`
- `prepare_export_bundle`
- `safe_page_inventory`
- `extract_component_candidates`
- `normalize_review_board`
- `get_runtime_sessions`
- `set_runtime_session`

These workflows are where future differentiation should continue to accumulate.
