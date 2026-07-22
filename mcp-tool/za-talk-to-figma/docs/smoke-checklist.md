# Runtime Smoke Checklist

Use this checklist after changing plugin UI, session routing, or the control plane.

## Plugin session console

- Open the plugin in one Figma file and confirm the main console fits inside `440x720` without overlap.
- Confirm the main screen only shows status, file/page/default route, action row, and activity strip.
- Open `Sessions`, `Logs`, and `Endpoint`; confirm each opens in its own modal and does not stretch the main layout.
- Click `Open admin`; confirm the external browser opens the current endpoint’s `/admin`.

## Multi-session runtime

- Open the plugin in two separate Figma files.
- Confirm the session catalog in the plugin shows both files.
- Switch the active route from the plugin and confirm the default route label updates.
- Switch the active route from `/admin` and confirm the plugin reflects the change after refresh/broadcast.

## Multi-client routing

- Connect two MCP clients or two runtime processes that proxy through the same leader.
- Use `set_runtime_session` from client A and verify client B keeps its own default route.
- Confirm `/admin` shows a route row for each client route.

## Runtime telemetry

- Trigger a lightweight read and verify an `execution_report` appears in plugin logs and `/admin/events`.
- Trigger a heavy read that falls back and verify the report shows `fallback` or `partial`.
- Confirm recent events remain bounded and ordered.
