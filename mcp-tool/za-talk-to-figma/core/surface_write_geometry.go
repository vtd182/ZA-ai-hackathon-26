package core

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteGeometryTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("set_fills",
		mcp.WithDescription("Set the fill color on a single node (takes one nodeId, not an array). Use mode='append' to stack a new fill on top of existing fills instead of replacing them."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("Node ID in colon format e.g. '4029:12345'"),
		),
		mcp.WithString("color",
			mcp.Required(),
			mcp.Description("Fill color as hex: #RRGGBB e.g. #FF5733 or #RRGGBBAA e.g. #FF573380 for 50% alpha"),
		),
		mcp.WithNumber("opacity", mcp.Description("Fill opacity 0–1 (default 1). Combines multiplicatively with any alpha in the color hex.")),
		mcp.WithString("mode", mcp.Description("'replace' (default) overwrites all existing fills; 'append' stacks this fill on top of existing ones")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		params := map[string]interface{}{"color": req.GetArguments()["color"]}
		if op, ok := req.GetArguments()["opacity"].(float64); ok {
			params["opacity"] = op
		}
		if m, ok := req.GetArguments()["mode"].(string); ok {
			params["mode"] = m
		}
		resp, err := runtime.Engine.Execute(ctx, "set_fills", []string{nodeID}, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_strokes",
		mcp.WithDescription("Set the stroke color and weight on a single node (takes one nodeId, not an array). Use mode='append' to stack a new stroke on top of existing strokes instead of replacing them."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("Node ID in colon format e.g. '4029:12345'"),
		),
		mcp.WithString("color",
			mcp.Required(),
			mcp.Description("Stroke color as hex e.g. #000000"),
		),
		mcp.WithNumber("strokeWeight", mcp.Description("Stroke weight in pixels (default 1)")),
		mcp.WithString("mode", mcp.Description("'replace' (default) overwrites all strokes; 'append' stacks on top of existing strokes")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		params := map[string]interface{}{"color": req.GetArguments()["color"]}
		if sw, ok := req.GetArguments()["strokeWeight"].(float64); ok {
			params["strokeWeight"] = sw
		}
		if m, ok := req.GetArguments()["mode"].(string); ok {
			params["mode"] = m
		}
		resp, err := runtime.Engine.Execute(ctx, "set_strokes", []string{nodeID}, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("move_nodes",
		mcp.WithDescription("Move one or more nodes to an absolute canvas position. The same x/y is applied to every node independently (not a relative offset from current position)."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithNumber("x", mcp.Description("Target X position")),
		mcp.WithNumber("y", mcp.Description("Target Y position")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		if x, ok := req.GetArguments()["x"].(float64); ok {
			params["x"] = x
		}
		if y, ok := req.GetArguments()["y"].(float64); ok {
			params["y"] = y
		}
		resp, err := runtime.Engine.Execute(ctx, "move_nodes", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("resize_nodes",
		mcp.WithDescription("Resize one or more nodes. The same width/height is applied to every node in the list independently. Provide width, height, or both."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithNumber("width", mcp.Description("New width in pixels")),
		mcp.WithNumber("height", mcp.Description("New height in pixels")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		if w, ok := req.GetArguments()["width"].(float64); ok {
			params["width"] = w
		}
		if h, ok := req.GetArguments()["height"].(float64); ok {
			params["height"] = h
		}
		resp, err := runtime.Engine.Execute(ctx, "resize_nodes", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_opacity",
		mcp.WithDescription("Set the opacity of one or more nodes (0 = fully transparent, 1 = fully opaque)."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithNumber("opacity", mcp.Required(), mcp.Description("Opacity value between 0 and 1")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		opacity, _ := req.GetArguments()["opacity"].(float64)
		resp, err := runtime.Engine.Execute(ctx, "set_opacity", nodeIDs, map[string]interface{}{"opacity": opacity})
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_corner_radius",
		mcp.WithDescription("Set corner radius on one or more nodes. Provide a uniform cornerRadius or individual per-corner values."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithNumber("cornerRadius", mcp.Description("Uniform corner radius applied to all corners")),
		mcp.WithNumber("topLeftRadius", mcp.Description("Top-left corner radius")),
		mcp.WithNumber("topRightRadius", mcp.Description("Top-right corner radius")),
		mcp.WithNumber("bottomLeftRadius", mcp.Description("Bottom-left corner radius")),
		mcp.WithNumber("bottomRightRadius", mcp.Description("Bottom-right corner radius")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		for _, key := range []string{"cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"} {
			if v, ok := req.GetArguments()[key].(float64); ok {
				params[key] = v
			}
		}
		resp, err := runtime.Engine.Execute(ctx, "set_corner_radius", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("rotate_nodes",
		mcp.WithDescription("Rotate one or more nodes to an absolute angle in degrees."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithNumber("rotation", mcp.Required(), mcp.Description("Rotation angle in degrees (positive = counter-clockwise in Figma)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		rotation, _ := req.GetArguments()["rotation"].(float64)
		resp, err := runtime.Engine.Execute(ctx, "rotate_nodes", nodeIDs, map[string]interface{}{"rotation": rotation})
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("reorder_nodes",
		mcp.WithDescription("Change the z-order (layer stack position) of one or more nodes."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithString("order", mcp.Required(), mcp.Description("Order operation: bringToFront, sendToBack, bringForward, or sendBackward")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		order, _ := req.GetArguments()["order"].(string)
		resp, err := runtime.Engine.Execute(ctx, "reorder_nodes", nodeIDs, map[string]interface{}{"order": order})
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_blend_mode",
		mcp.WithDescription("Set the blend mode of one or more nodes (e.g. MULTIPLY, SCREEN, OVERLAY)."),
		mcp.WithArray("nodeIds", mcp.Required(), mcp.Description("Node IDs in colon format e.g. ['4029:12345']"), mcp.WithStringItems()),
		mcp.WithString("blendMode", mcp.Required(), mcp.Description("Blend mode: NORMAL, MULTIPLY, SCREEN, OVERLAY, DARKEN, LIGHTEN, COLOR_DODGE, COLOR_BURN, HARD_LIGHT, SOFT_LIGHT, DIFFERENCE, EXCLUSION, HUE, SATURATION, COLOR, LUMINOSITY, PASS_THROUGH")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		blendMode, _ := req.GetArguments()["blendMode"].(string)
		resp, err := runtime.Engine.Execute(ctx, "set_blend_mode", nodeIDs, map[string]interface{}{"blendMode": blendMode})
		return renderResponse(resp, err)
	})
}
