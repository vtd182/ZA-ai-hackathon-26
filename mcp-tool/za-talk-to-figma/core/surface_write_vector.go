package core

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteVectorTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("boolean_operation",
		mcp.WithDescription("Combine two or more shape/vector nodes with a boolean operation, producing a single editable boolean-operation node. Useful for building icons and compound shapes. The nodes must share a common parent."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("At least two node IDs in colon format e.g. ['4029:12345', '4029:67890']"),
			mcp.WithStringItems(),
		),
		mcp.WithString("operation",
			mcp.Required(),
			mcp.Description("UNION (merge), SUBTRACT (top removes those below), INTERSECT (overlap only), or EXCLUDE (overlap removed)."),
		),
		mcp.WithString("name", mcp.Description("Optional name for the resulting node.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		copyOptionalArg(params, req.GetArguments(), "operation", "name")
		resp, err := runtime.Engine.Execute(ctx, "boolean_operation", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("flatten_node",
		mcp.WithDescription("Flatten one or more nodes into a single vector node, merging their geometry and rasterizing layer structure. Irreversible flattening of the layer tree — useful before export or to simplify a complex shape. Nodes must share a common parent."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("One or more node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
		mcp.WithString("name", mcp.Description("Optional name for the resulting vector node.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		copyOptionalArg(params, req.GetArguments(), "name")
		resp, err := runtime.Engine.Execute(ctx, "flatten_node", nodeIDs, params)
		return renderResponse(resp, err)
	})
}
