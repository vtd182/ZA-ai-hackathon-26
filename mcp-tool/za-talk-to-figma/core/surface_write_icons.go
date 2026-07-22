package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteIconTools(s *server.MCPServer, runtime *Runtime) {
	// ── C: import_svg ─────────────────────────────────────────────────────────
	s.AddTool(mcp.NewTool("import_svg",
		mcp.WithDescription("Import an SVG markup string as a FRAME node containing real vector paths in Figma. Use for icons when no DS component is available — Claude/Codex can generate SVG for common icons (search, close, arrow, home, check, user, settings, etc.)."),
		mcp.WithString("svgContent",
			mcp.Required(),
			mcp.Description(`SVG markup string. Example: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8" stroke="#000" stroke-width="2"/><path d="m21 21-4.35-4.35" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>'`),
		),
		mcp.WithString("name", mcp.Description("Node name. Convention: 'Icon / [semantic-name]' e.g. 'Icon / Search'.")),
		mcp.WithNumber("size", mcp.Description("Resize to this square size in px after import. Omit to keep natural SVG dimensions.")),
		mcp.WithString("parentId", mcp.Description("Parent node ID. Defaults to current page.")),
		mcp.WithNumber("x", mcp.Description("X position.")),
		mcp.WithNumber("y", mcp.Description("Y position.")),
		withOptionalSessionTarget(),
	), makeArgsHandler(runtime, "import_svg", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		copyOptionalArg(params, args, "svgContent", "name", "size", "parentId", "x", "y", "sessionId")
		return params
	}))

	// ── F: create_icon_placeholder ────────────────────────────────────────────
	s.AddTool(mcp.NewTool("create_icon_placeholder",
		mcp.WithDescription("Create a structured icon placeholder frame when no DS component or SVG is available. Produces a correctly-named, sized frame that is easy to find and replace later. Always better than emoji or text characters for icon slots."),
		mcp.WithString("name",
			mcp.Required(),
			mcp.Description("Semantic icon name (e.g. 'search', 'close', 'arrow-right'). The node is named 'Icon / [name]'."),
		),
		mcp.WithNumber("size", mcp.Description("Square size in px. Default 24.")),
		mcp.WithString("parentId", mcp.Description("Parent node ID. Defaults to current page.")),
		mcp.WithNumber("x", mcp.Description("X position.")),
		mcp.WithNumber("y", mcp.Description("Y position.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		sessionID, _ := args["sessionId"].(string)
		iconName, _ := args["name"].(string)
		if iconName == "" {
			return mcp.NewToolResultError("name is required"), nil
		}
		size := 24.0
		if s, ok := args["size"].(float64); ok && s > 0 {
			size = s
		}
		parentID, _ := args["parentId"].(string)
		x, _ := args["x"].(float64)
		y, _ := args["y"].(float64)

		result, err := createIconPlaceholder(ctx, runtime, iconName, size, parentID, x, y, sessionID)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		out, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal create_icon_placeholder: %v", marshalErr)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})
}

func createIconPlaceholder(ctx context.Context, runtime *Runtime, iconName string, size float64, parentID string, x, y float64, sessionID string) (map[string]any, error) {
	nodeName := "Icon / " + intentToTitle(iconName)
	innerSize := size * 0.5
	innerOffset := size * 0.25

	frameParams := map[string]interface{}{
		"name":         nodeName,
		"width":        size,
		"height":       size,
		"fillColor":    "#F2F4F7",
		"cornerRadius": 2.0,
	}
	if parentID != "" {
		frameParams["parentId"] = parentID
	}
	if x != 0 {
		frameParams["x"] = x
	}
	if y != 0 {
		frameParams["y"] = y
	}
	if sessionID != "" {
		frameParams["sessionId"] = sessionID
	}

	frameResult, err := runtime.Engine.ExecuteDetailed(ctx, "create_frame", nil, frameParams)
	if err != nil {
		return nil, fmt.Errorf("create_icon_placeholder frame: %w", err)
	}
	if frameResult.Response.Error != "" {
		return nil, errors.New(frameResult.Response.Error)
	}
	var frame map[string]any
	if err := decodeInto(frameResult.Response.Data, &frame); err != nil {
		return nil, fmt.Errorf("decode frame: %w", err)
	}

	frameID, _ := frame["id"].(string)
	markParams := map[string]interface{}{
		"name":         "mark",
		"parentId":     frameID,
		"width":        innerSize,
		"height":       innerSize,
		"fillColor":    "#98A2B3",
		"cornerRadius": 1.0,
		"x":            innerOffset,
		"y":            innerOffset,
	}
	if sessionID != "" {
		markParams["sessionId"] = sessionID
	}
	// Best-effort inner mark — failure doesn't break the placeholder.
	runtime.Engine.ExecuteDetailed(ctx, "create_rectangle", nil, markParams) //nolint:errcheck

	return map[string]any{
		"id":            frameID,
		"name":          nodeName,
		"size":          size,
		"isPlaceholder": true,
		"hint":          "Replace with a real icon component or import_svg when available.",
	}, nil
}
