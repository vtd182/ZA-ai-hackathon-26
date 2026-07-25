package core

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerProductCraftTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("apply_craft_patch",
		mcp.WithDescription(`Apply 1-80 dependent craft operations inside one approved artifact root in a single MCP round-trip. Each operation is {"id":"alias","type":"create_frame|create_text|clone_node|set_text|...","nodeIds":["$alias"],"params":{"parentId":"$alias",...}}. An exact "$alias" resolves to a node created or targeted earlier in the patch. Creates default to rootNodeId. Source nodes for clone_node may come from the read-only ZDS Page; every destination and modified target must remain inside rootNodeId. Earlier operations remain applied if a later operation fails, so read back before retrying.`),
		mcp.WithString("rootNodeId",
			mcp.Required(),
			mcp.Description("Approved writable artifact root node ID in colon format."),
		),
		mcp.WithArray("operations",
			mcp.Required(),
			mcp.Description("Ordered craft operations. Use stable aliases and keep a patch coherent (typically 5-40 operations)."),
			mcp.Items(map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"id", "type"},
				"properties": map[string]any{
					"id":      map[string]any{"type": "string"},
					"type":    map[string]any{"type": "string"},
					"nodeIds": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"params":  map[string]any{"type": "object"},
				},
			}),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		params := map[string]interface{}{
			"rootNodeId": args["rootNodeId"],
			"operations": args["operations"],
		}
		params = injectOptionalSession(params, req)
		resp, err := executeCapability(ctx, runtime, "apply_craft_patch", nil, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("audit_product_craft",
		mcp.WithDescription("Independently audit a crafted product artifact for mobile screen coverage, real ZDS instances, prototype links, stale component copy, forbidden ProductSpec copy, low-visibility text and text extending outside screen frames. Run this after visual refinement; tool success alone is not a passing audit."),
		mcp.WithString("rootNodeId",
			mcp.Required(),
			mcp.Description("Approved artifact root node ID in colon format."),
		),
		mcp.WithNumber("expectedScreenCount",
			mcp.Description("Expected number of mobile screen frames."),
		),
		mcp.WithNumber("expectedPrototypeLinks",
			mcp.Description("Minimum required prototype navigation links."),
		),
		mcp.WithArray("forbiddenTerms",
			mcp.Description("ProductSpec terms that must not appear in visible artifact copy."),
			mcp.WithStringItems(),
		),
		mcp.WithArray("placeholderTerms",
			mcp.Description("Additional placeholder/default-copy terms to reject."),
			mcp.WithStringItems(),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		params := map[string]interface{}{
			"rootNodeId": args["rootNodeId"],
		}
		copyOptionalArg(params, args,
			"expectedScreenCount",
			"expectedPrototypeLinks",
			"forbiddenTerms",
			"placeholderTerms",
		)
		params = injectOptionalSession(params, req)
		resp, err := executeCapability(ctx, runtime, "audit_product_craft", nil, params)
		return renderResponse(resp, err)
	})
}
