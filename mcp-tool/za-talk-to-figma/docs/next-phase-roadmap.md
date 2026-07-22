# Next Phase Roadmap

This roadmap captured the current push to make `za-talk-to-figma` stronger as an execution runtime. The items below are now implemented in the current codebase and serve as the acceptance baseline for the next round.

## Focus areas

1. session-aware routing
2. execution reports in the Runtime Console
3. deeper heavy-read fallback orchestration
4. smarter review and extraction workflows

## 1. Session-aware routing

The runtime should stop assuming a single global plugin world.

Targets:

- every plugin runtime instance announces a `sessionId`
- the bridge tracks multiple live sessions
- capabilities can target a specific session through `sessionId`
- the runtime falls back to the active session when no explicit target is provided

## 2. Execution reports in UI

Execution reports should become visible runtime telemetry, not just server logs.

Targets:

- emit `execution_report` events to the Runtime Console
- show:
  - capability
  - profile
  - duration
  - attempts
  - result class
  - fallback path
- keep the timeline stable and readable

## 3. Fallback orchestration

Heavy reads should degrade gracefully instead of dying on timeout.

Targets:

- retry heavy reads with compact params
- fallback to safer context-oriented capabilities when declared
- return structured partial results with:
  - `truncated`
  - `fallbackUsed`
  - `fallbackReason`
  - `recommendedNextCalls`

## 4. Smart workflows

Grow beyond raw bridge tools.

New workflow surface:

- `safe_page_inventory`
- `extract_component_candidates`
- `normalize_review_board`
- stronger `prepare_handoff_bundle`

## Verification

Each phase should continue to pass:

- `go test ./...`
- `go build -o bin/za-talk-to-figma ./cmd/za-talk-to-figma`
- `cd plugin && bun run build`
