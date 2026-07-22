package core

import (
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteComponentTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("navigate_to_page",
		mcp.WithDescription("Switch the active Figma page. Provide either pageId or pageName."),
		mcp.WithString("pageId", mcp.Description("Page node ID in colon format e.g. '0:1'")),
		mcp.WithString("pageName", mcp.Description("Exact page name to navigate to")),
	), makeArgsHandler(runtime, "navigate_to_page", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		if id, ok := args["pageId"].(string); ok && id != "" {
			params["pageId"] = id
		}
		if name, ok := args["pageName"].(string); ok && name != "" {
			params["pageName"] = name
		}
		return params
	}))

	s.AddTool(mcp.NewTool("group_nodes",
		mcp.WithDescription("Group two or more nodes into a GROUP. All nodes must share the same parent."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Node IDs to group (minimum 2), in colon format e.g. ['4029:12345', '4029:12346']"),
			mcp.WithStringItems(),
		),
		mcp.WithString("name", mcp.Description("Optional name for the new group")),
	), makeMultiNodeHandler(runtime, "group_nodes", "nodeIds", false, func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		if name, ok := args["name"].(string); ok && name != "" {
			params["name"] = name
		}
		return params
	}))

	s.AddTool(mcp.NewTool("ungroup_nodes",
		mcp.WithDescription("Ungroup one or more GROUP nodes, moving their children to the parent and removing the group."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("GROUP node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
	), makeMultiNodeHandler(runtime, "ungroup_nodes", "nodeIds", false, nil))

	s.AddTool(mcp.NewTool("swap_component",
		mcp.WithDescription("Swap the main component of an existing INSTANCE node, replacing it with a different component while keeping position and size."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("INSTANCE node ID in colon format e.g. 4029:12345"),
		),
		mcp.WithString("componentId",
			mcp.Required(),
			mcp.Description("Target COMPONENT node ID in colon format (from get_local_components)"),
		),
	), makeSingleNodeHandler(runtime, "swap_component", "nodeId", true, func(args map[string]interface{}) map[string]interface{} {
		componentID, _ := args["componentId"].(string)
		return map[string]interface{}{"componentId": NormalizeNodeID(componentID)}
	}))

	s.AddTool(mcp.NewTool("instantiate_component",
		mcp.WithDescription("Create a new INSTANCE from a source component. Use this instead of clone_node when you need a design-system-backed instance on the target screen."),
		mcp.WithString("componentId", mcp.Description("Concrete COMPONENT node ID in colon format e.g. '4029:12345'.")),
		mcp.WithString("componentSetId", mcp.Description("Optional COMPONENT_SET node ID in colon format. If used, the runtime resolves a variant before instantiation.")),
		mcp.WithObject("variantProperties",
			mcp.Description("Optional variant property map used when componentSetId is provided, e.g. {\"State\":\"Default\",\"Size\":\"Large\"}."),
		),
		mcp.WithString("parentId", mcp.Description("Parent node ID for the new instance. Defaults to current page.")),
		mcp.WithNumber("x", mcp.Description("Optional X position of the instance.")),
		mcp.WithNumber("y", mcp.Description("Optional Y position of the instance.")),
	), makeArgsHandler(runtime, "instantiate_component", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		if componentID, ok := args["componentId"].(string); ok && componentID != "" {
			params["componentId"] = NormalizeNodeID(componentID)
		}
		if componentSetID, ok := args["componentSetId"].(string); ok && componentSetID != "" {
			params["componentSetId"] = NormalizeNodeID(componentSetID)
		}
		copyOptionalArg(params, args, "variantProperties", "parentId", "x", "y", "sessionId")
		return params
	}))

	s.AddTool(mcp.NewTool("instantiate_component_by_key",
		mcp.WithDescription("Import a component from a published Figma Team Library by its stable key and create an instance in the target file.\n\nPREREQUISITE (hard requirement): The source design system file MUST be published as a Figma Team Library (main menu → Libraries → Publish) AND enabled in the target file (Resources panel → Libraries). If the DS file is merely open in another tab but NOT published, this call will fail with 'component not found'.\n\nWhen this tool fails: (1) ask the user to publish the DS file as a team library, or (2) fall back to recreating the component using create_frame + primitives from the DS context data."),
		mcp.WithString("key",
			mcp.Required(),
			mcp.Description("Component key (dsLocalComponent.key from capture_design_system_context). A stable string identifier that works across files."),
		),
		mcp.WithString("parentId", mcp.Description("Parent node ID for the instance. Defaults to current page.")),
		mcp.WithNumber("x", mcp.Description("X position of the new instance.")),
		mcp.WithNumber("y", mcp.Description("Y position of the new instance.")),
		withOptionalSessionTarget(),
	), makeArgsHandler(runtime, "import_component_by_key", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		copyOptionalArg(params, args, "key", "parentId", "x", "y", "sessionId")
		return params
	}))

	s.AddTool(mcp.NewTool("detach_instance",
		mcp.WithDescription("Detach one or more component instances, converting them to plain frames. The link to the main component is broken; all visual properties are preserved."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("INSTANCE node IDs in colon format e.g. ['4029:12345']"),
			mcp.WithStringItems(),
		),
	), makeMultiNodeHandler(runtime, "detach_instance", "nodeIds", true, nil))
}
