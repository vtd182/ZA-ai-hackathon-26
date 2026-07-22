package core

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteLayoutTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("set_auto_layout",
		mcp.WithDescription("Set or update auto-layout (flex) properties on an existing frame."),
		mcp.WithString("nodeId", mcp.Required(), mcp.Description("Frame node ID in colon format e.g. '4029:12345'")),
		mcp.WithString("layoutMode", mcp.Description("Auto-layout direction: HORIZONTAL, VERTICAL, or NONE")),
		mcp.WithNumber("paddingTop", mcp.Description("Top padding")),
		mcp.WithNumber("paddingRight", mcp.Description("Right padding")),
		mcp.WithNumber("paddingBottom", mcp.Description("Bottom padding")),
		mcp.WithNumber("paddingLeft", mcp.Description("Left padding")),
		mcp.WithNumber("itemSpacing", mcp.Description("Gap between children")),
		mcp.WithString("primaryAxisAlignItems", mcp.Description("Main-axis alignment: MIN, CENTER, MAX, or SPACE_BETWEEN")),
		mcp.WithString("counterAxisAlignItems", mcp.Description("Cross-axis alignment: MIN, CENTER, MAX, or BASELINE")),
		mcp.WithString("primaryAxisSizingMode", mcp.Description("Main-axis sizing: FIXED or AUTO (hug)")),
		mcp.WithString("counterAxisSizingMode", mcp.Description("Cross-axis sizing: FIXED or AUTO (hug)")),
		mcp.WithString("layoutWrap", mcp.Description("Wrap behaviour: NO_WRAP or WRAP")),
		mcp.WithNumber("counterAxisSpacing", mcp.Description("Gap between wrapped rows/columns (only when layoutWrap is WRAP)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		resp, err := runtime.Engine.Execute(ctx, "set_auto_layout", []string{nodeID}, req.GetArguments())
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_constraints",
		mcp.WithDescription("Set layout constraints (pinning behaviour) on one or more nodes relative to their parent."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithString("horizontal", mcp.Description("Horizontal constraint: MIN (left), MAX (right), CENTER, STRETCH, or SCALE")),
		mcp.WithString("vertical", mcp.Description("Vertical constraint: MIN (top), MAX (bottom), CENTER, STRETCH, or SCALE")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		if h, ok := req.GetArguments()["horizontal"].(string); ok && h != "" {
			params["horizontal"] = h
		}
		if v, ok := req.GetArguments()["vertical"].(string); ok && v != "" {
			params["vertical"] = v
		}
		resp, err := runtime.Engine.Execute(ctx, "set_constraints", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("reparent_nodes",
		mcp.WithDescription("Move one or more nodes to a different parent frame, group, or section."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs to move in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithString("parentId", mcp.Required(), mcp.Description("Target parent node ID in colon format e.g. '4029:99'")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		parentID, _ := req.GetArguments()["parentId"].(string)
		parentID = NormalizeNodeID(parentID)
		resp, err := runtime.Engine.Execute(ctx, "reparent_nodes", nodeIDs, map[string]interface{}{"parentId": parentID})
		return renderResponse(resp, err)
	})
}
