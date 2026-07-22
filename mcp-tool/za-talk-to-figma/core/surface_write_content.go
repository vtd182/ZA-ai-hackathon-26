package core

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteContentTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("set_text",
		mcp.WithDescription("Update the text content of an existing TEXT node. Do NOT set emoji as icon representations — use instantiate_component_by_key, import_svg, or create_icon_placeholder instead. Text does not support \\n escape sequences."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("TEXT node ID in colon format e.g. '4029:12345'"),
		),
		mcp.WithString("text",
			mcp.Required(),
			mcp.Description("New text content. No \\n escape sequences."),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		text, _ := req.GetArguments()["text"].(string)
		resp, err := runtime.Engine.Execute(ctx, "set_text", []string{nodeID}, map[string]interface{}{"text": text})
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_text_properties",
		mcp.WithDescription("Set typography on an existing TEXT node: font family/style, size, spacing, alignment, case, and decoration. Use set_text to change the text content; use this to restyle it. Fonts are loaded automatically before applying changes."),
		mcp.WithString("nodeId", mcp.Required(), mcp.Description("TEXT node ID in colon format e.g. '4029:12345'")),
		mcp.WithString("fontFamily", mcp.Description("Font family e.g. 'Inter'. Pair with fontStyle.")),
		mcp.WithString("fontStyle", mcp.Description("Font style/weight e.g. 'Regular', 'Bold', 'Medium Italic'.")),
		mcp.WithNumber("fontSize", mcp.Description("Font size in pixels.")),
		mcp.WithNumber("letterSpacing", mcp.Description("Letter spacing value.")),
		mcp.WithString("letterSpacingUnit", mcp.Description("'PIXELS' (default) or 'PERCENT'.")),
		mcp.WithNumber("lineHeight", mcp.Description("Line height value. Omit and set lineHeightAuto=true for automatic line height.")),
		mcp.WithString("lineHeightUnit", mcp.Description("'PIXELS' (default) or 'PERCENT'.")),
		mcp.WithBoolean("lineHeightAuto", mcp.Description("Set automatic (font-derived) line height.")),
		mcp.WithNumber("paragraphSpacing", mcp.Description("Spacing between paragraphs in pixels.")),
		mcp.WithString("textAlignHorizontal", mcp.Description("LEFT, CENTER, RIGHT, or JUSTIFIED.")),
		mcp.WithString("textAlignVertical", mcp.Description("TOP, CENTER, or BOTTOM.")),
		mcp.WithString("textCase", mcp.Description("ORIGINAL, UPPER, LOWER, or TITLE.")),
		mcp.WithString("textDecoration", mcp.Description("NONE, UNDERLINE, or STRIKETHROUGH.")),
		mcp.WithString("textAutoResize", mcp.Description("NONE, WIDTH_AND_HEIGHT, HEIGHT, or TRUNCATE.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		nodeID, _ := args["nodeId"].(string)
		params := map[string]interface{}{}
		copyOptionalArg(params, args,
			"fontFamily", "fontStyle", "letterSpacingUnit", "lineHeightUnit",
			"textAlignHorizontal", "textAlignVertical", "textCase", "textDecoration", "textAutoResize")
		for _, k := range []string{"fontSize", "letterSpacing", "lineHeight", "paragraphSpacing"} {
			if v, ok := args[k].(float64); ok {
				params[k] = v
			}
		}
		if v, ok := args["lineHeightAuto"].(bool); ok {
			params["lineHeightAuto"] = v
		}
		resp, err := runtime.Engine.Execute(ctx, "set_text_properties", []string{nodeID}, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("rename_node",
		mcp.WithDescription("Rename a single node by ID. Returns the updated node with its new name. Use batch_rename_nodes to rename multiple nodes at once or to apply find/replace patterns across many nodes."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("Node ID in colon format e.g. '4029:12345'"),
		),
		mcp.WithString("name",
			mcp.Required(),
			mcp.Description("New name for the node. Figma supports slash-separated path notation e.g. 'Icons/Arrow/Left' to organise nodes in component panels."),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		name, _ := req.GetArguments()["name"].(string)
		resp, err := runtime.Engine.Execute(ctx, "rename_node", []string{nodeID}, map[string]interface{}{"name": name})
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("clone_node",
		mcp.WithDescription("Clone an existing node, optionally repositioning it or placing it in a new parent."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("Source node ID in colon format e.g. '4029:12345'"),
		),
		mcp.WithNumber("x", mcp.Description("X position of the clone")),
		mcp.WithNumber("y", mcp.Description("Y position of the clone")),
		mcp.WithString("parentId", mcp.Description("Parent node ID for the clone. Defaults to same parent as source.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		params := map[string]interface{}{}
		if x, ok := req.GetArguments()["x"].(float64); ok {
			params["x"] = x
		}
		if y, ok := req.GetArguments()["y"].(float64); ok {
			params["y"] = y
		}
		if pid, ok := req.GetArguments()["parentId"].(string); ok && pid != "" {
			params["parentId"] = pid
		}
		resp, err := runtime.Engine.Execute(ctx, "clone_node", []string{nodeID}, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("delete_nodes",
		mcp.WithDescription("Delete one or more nodes. This cannot be undone via MCP — use with care."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Node IDs to delete in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		resp, err := runtime.Engine.Execute(ctx, "delete_nodes", nodeIDs, nil)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("set_visible",
		mcp.WithDescription("Show or hide one or more nodes by setting their visibility."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
		mcp.WithBoolean("visible",
			mcp.Required(),
			mcp.Description("true to show the node, false to hide it"),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		visible, _ := req.GetArguments()["visible"].(bool)
		resp, err := runtime.Engine.Execute(ctx, "set_visible", nodeIDs, map[string]interface{}{"visible": visible})
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("lock_nodes",
		mcp.WithDescription("Lock one or more nodes to prevent accidental edits in Figma."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		resp, err := runtime.Engine.Execute(ctx, "lock_nodes", nodeIDs, nil)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("unlock_nodes",
		mcp.WithDescription("Unlock one or more nodes, allowing them to be edited again."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		resp, err := runtime.Engine.Execute(ctx, "unlock_nodes", nodeIDs, nil)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("batch_rename_nodes",
		mcp.WithDescription("Rename multiple nodes using find/replace, regex substitution, or prefix/suffix addition."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
		mcp.WithString("find", mcp.Description("String (or regex pattern when useRegex=true) to search for in the node name")),
		mcp.WithString("replace", mcp.Description("Replacement string. Required when find is provided.")),
		mcp.WithBoolean("useRegex", mcp.Description("Treat find as a regular expression (default false)")),
		mcp.WithString("regexFlags", mcp.Description("Regex flags e.g. 'gi' (default 'g'). Only used when useRegex=true.")),
		mcp.WithString("prefix", mcp.Description("String to prepend to the node name")),
		mcp.WithString("suffix", mcp.Description("String to append to the node name")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		for _, k := range []string{"find", "replace", "regexFlags", "prefix", "suffix"} {
			if v, ok := req.GetArguments()[k].(string); ok {
				params[k] = v
			}
		}
		if v, ok := req.GetArguments()["useRegex"].(bool); ok {
			params["useRegex"] = v
		}
		resp, err := runtime.Engine.Execute(ctx, "batch_rename_nodes", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("find_replace_text",
		mcp.WithDescription("Find and replace text content across all TEXT nodes in a subtree. Searches the entire current page if no nodeId is given."),
		mcp.WithString("find",
			mcp.Required(),
			mcp.Description("Text string (or regex pattern when useRegex=true) to search for"),
		),
		mcp.WithString("replace",
			mcp.Required(),
			mcp.Description("Replacement string (use empty string to delete matches)"),
		),
		mcp.WithString("nodeId", mcp.Description("Root node ID to scope the search. Defaults to the entire current page.")),
		mcp.WithBoolean("useRegex", mcp.Description("Treat find as a regular expression (default false)")),
		mcp.WithString("regexFlags", mcp.Description("Regex flags e.g. 'gi' (default 'g'). Only used when useRegex=true.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		params := map[string]interface{}{
			"find":    req.GetArguments()["find"],
			"replace": req.GetArguments()["replace"],
		}
		if v, ok := req.GetArguments()["useRegex"].(bool); ok {
			params["useRegex"] = v
		}
		if v, ok := req.GetArguments()["regexFlags"].(string); ok && v != "" {
			params["regexFlags"] = v
		}
		var nodeIDs []string
		if nodeID, ok := req.GetArguments()["nodeId"].(string); ok && nodeID != "" {
			nodeID = NormalizeNodeID(nodeID)
			nodeIDs = []string{nodeID}
		}
		resp, err := runtime.Engine.Execute(ctx, "find_replace_text", nodeIDs, params)
		return renderResponse(resp, err)
	})
}
