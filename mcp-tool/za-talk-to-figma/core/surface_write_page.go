package core

import (
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWritePageTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("add_page",
		mcp.WithDescription("Add a new page to the Figma document."),
		mcp.WithString("name", mcp.Description("Name for the new page (default 'Page')")),
		mcp.WithNumber("index", mcp.Description("Position index to insert the page (0 = first). Defaults to last position.")),
	), makeArgsHandler(runtime, "add_page", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		if name, ok := args["name"].(string); ok && name != "" {
			params["name"] = name
		}
		if idx, ok := args["index"].(float64); ok {
			params["index"] = idx
		}
		return params
	}))

	s.AddTool(mcp.NewTool("delete_page",
		mcp.WithDescription("Delete a page from the Figma document. Cannot delete the only remaining page."),
		mcp.WithString("pageId", mcp.Description("Page node ID in colon format e.g. '0:2'")),
		mcp.WithString("pageName", mcp.Description("Exact page name to delete (alternative to pageId)")),
	), makeArgsHandler(runtime, "delete_page", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		if id, ok := args["pageId"].(string); ok && id != "" {
			params["pageId"] = id
		}
		if name, ok := args["pageName"].(string); ok && name != "" {
			params["pageName"] = name
		}
		return params
	}))

	s.AddTool(mcp.NewTool("rename_page",
		mcp.WithDescription("Rename an existing page in the Figma document."),
		mcp.WithString("pageId", mcp.Description("Page node ID in colon format e.g. '0:2'")),
		mcp.WithString("pageName", mcp.Description("Current page name to find (alternative to pageId)")),
		mcp.WithString("newName",
			mcp.Required(),
			mcp.Description("New name for the page"),
		),
	), makeArgsHandler(runtime, "rename_page", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		if id, ok := args["pageId"].(string); ok && id != "" {
			params["pageId"] = id
		}
		if name, ok := args["pageName"].(string); ok && name != "" {
			params["pageName"] = name
		}
		if newName, ok := args["newName"].(string); ok {
			params["newName"] = newName
		}
		return params
	}))
}
