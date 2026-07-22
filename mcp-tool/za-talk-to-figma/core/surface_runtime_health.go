package core

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerRuntimeObservabilityTools registers server-side diagnostics tools.
// These do NOT round-trip to the Figma plugin, so they work even when the
// plugin is disconnected — which is exactly when you need to diagnose why.
func registerRuntimeObservabilityTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("get_runtime_health",
		mcp.WithDescription("Diagnose the runtime itself (not the Figma document). Returns role (leader/follower), version, whether a Figma plugin is connected, the active session, connected session count, in-flight request count, and the current log level. Call this first when a tool returns a PLUGIN_NOT_CONNECTED or TIMEOUT error to confirm whether the plugin is attached and the runtime is healthy. Works even when no plugin is connected."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		health := runtime.Node.Health(ctx)
		text, err := json.Marshal(health)
		if err != nil {
			rerr := newRuntimeError(CodeInternal, fmt.Sprintf("marshal runtime health: %v", err), false, err)
			return mcp.NewToolResultError(marshalErrorEnvelope(rerr)), nil
		}
		return mcp.NewToolResultText(string(text)), nil
	})

	s.AddTool(mcp.NewTool("get_recent_events",
		mcp.WithDescription("Return the runtime's recent event stream: execution reports (capability, duration, result class, fallback usage), session announcements/switches, and runtime reloads. This is the same data the /admin control plane shows, exposed over MCP so you can inspect what the runtime has been doing — including failed and fallback executions — without opening a browser. Useful for debugging slow or failing tool calls."),
		mcp.WithNumber("limit",
			mcp.Description("Maximum number of most-recent events to return (default 40, max 120)."),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		limit := 40
		if raw, ok := req.GetArguments()["limit"].(float64); ok && raw > 0 {
			limit = int(raw)
		}
		if limit > 120 {
			limit = 120
		}
		events, err := runtime.Node.RecentEvents(ctx, limit)
		if err != nil {
			rerr := classifyError(err, "")
			return mcp.NewToolResultError(marshalErrorEnvelope(rerr)), nil
		}
		text, marshalErr := json.Marshal(map[string]any{
			"count":  len(events),
			"events": events,
		})
		if marshalErr != nil {
			rerr := newRuntimeError(CodeInternal, fmt.Sprintf("marshal recent events: %v", marshalErr), false, marshalErr)
			return mcp.NewToolResultError(marshalErrorEnvelope(rerr)), nil
		}
		return mcp.NewToolResultText(string(text)), nil
	})
}
