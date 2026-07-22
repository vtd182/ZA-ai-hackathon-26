package core

import (
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerWriteCreateTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("create_frame",
		mcp.WithDescription("Create a new frame on the current page or inside a parent node."),
		mcp.WithNumber("x", mcp.Description("X position (default 0)")),
		mcp.WithNumber("y", mcp.Description("Y position (default 0)")),
		mcp.WithNumber("width", mcp.Description("Width in pixels (default 100)")),
		mcp.WithNumber("height", mcp.Description("Height in pixels (default 100)")),
		mcp.WithString("name", mcp.Description("Frame name")),
		mcp.WithString("fillColor", mcp.Description("Fill color as hex e.g. #FFFFFF")),
		mcp.WithString("layoutMode", mcp.Description("Auto-layout direction: HORIZONTAL, VERTICAL, or NONE")),
		mcp.WithNumber("paddingTop", mcp.Description("Auto-layout top padding")),
		mcp.WithNumber("paddingRight", mcp.Description("Auto-layout right padding")),
		mcp.WithNumber("paddingBottom", mcp.Description("Auto-layout bottom padding")),
		mcp.WithNumber("paddingLeft", mcp.Description("Auto-layout left padding")),
		mcp.WithNumber("itemSpacing", mcp.Description("Auto-layout gap between children")),
		mcp.WithString("primaryAxisAlignItems", mcp.Description("Main-axis alignment: MIN, CENTER, MAX, or SPACE_BETWEEN")),
		mcp.WithString("counterAxisAlignItems", mcp.Description("Cross-axis alignment: MIN, CENTER, MAX, or BASELINE")),
		mcp.WithString("primaryAxisSizingMode", mcp.Description("Main-axis sizing: FIXED or AUTO (hug)")),
		mcp.WithString("counterAxisSizingMode", mcp.Description("Cross-axis sizing: FIXED or AUTO (hug)")),
		mcp.WithString("layoutWrap", mcp.Description("Wrap behaviour: NO_WRAP or WRAP")),
		mcp.WithNumber("counterAxisSpacing", mcp.Description("Gap between wrapped rows/columns (only when layoutWrap is WRAP)")),
		mcp.WithString("parentId", mcp.Description("Parent node ID in colon format. Defaults to current page.")),
	), makeArgsHandler(runtime, "create_frame", nil))

	s.AddTool(mcp.NewTool("create_rectangle",
		mcp.WithDescription("Create a new rectangle on the current page or inside a parent node."),
		mcp.WithNumber("x", mcp.Description("X position (default 0)")),
		mcp.WithNumber("y", mcp.Description("Y position (default 0)")),
		mcp.WithNumber("width", mcp.Description("Width in pixels (default 100)")),
		mcp.WithNumber("height", mcp.Description("Height in pixels (default 100)")),
		mcp.WithString("name", mcp.Description("Rectangle name")),
		mcp.WithString("fillColor", mcp.Description("Fill color as hex e.g. #FF5733")),
		mcp.WithNumber("cornerRadius", mcp.Description("Corner radius in pixels")),
		mcp.WithString("parentId", mcp.Description("Parent node ID in colon format. Defaults to current page.")),
	), makeArgsHandler(runtime, "create_rectangle", nil))

	s.AddTool(mcp.NewTool("create_ellipse",
		mcp.WithDescription("Create a new ellipse (circle/oval) on the current page or inside a parent node."),
		mcp.WithNumber("x", mcp.Description("X position (default 0)")),
		mcp.WithNumber("y", mcp.Description("Y position (default 0)")),
		mcp.WithNumber("width", mcp.Description("Width in pixels (default 100)")),
		mcp.WithNumber("height", mcp.Description("Height in pixels (default 100)")),
		mcp.WithString("name", mcp.Description("Ellipse name")),
		mcp.WithString("fillColor", mcp.Description("Fill color as hex e.g. #3B82F6")),
		mcp.WithString("parentId", mcp.Description("Parent node ID in colon format. Defaults to current page.")),
	), makeArgsHandler(runtime, "create_ellipse", nil))

	s.AddTool(mcp.NewTool("create_text",
		mcp.WithDescription("Create a new text node on the current page or inside a parent node. The font is loaded automatically before insertion. Returns the created node ID and bounds. Use set_text to update the content of an existing text node.\n\nICON RULE — NEVER use emoji or Unicode characters (💧, 🏠, ⚒️, etc.) to represent icons in this text node. For icons use: (1) scan_icon_components + instantiate_component_by_key for DS library icons, (2) import_svg for custom SVG, (3) create_icon_placeholder as last resort.\n\nNEWLINE: the text parameter does NOT support \\n escape sequences — Figma renders them as literal backslash-n. Use separate text nodes for stacked labels."),
		mcp.WithString("text",
			mcp.Required(),
			mcp.Description("Text content to display. No \\n escape sequences — they render literally."),
		),
		mcp.WithNumber("x", mcp.Description("X position in pixels (default 0)")),
		mcp.WithNumber("y", mcp.Description("Y position in pixels (default 0)")),
		mcp.WithNumber("fontSize", mcp.Description("Font size in pixels (default 14)")),
		mcp.WithString("fontFamily", mcp.Description("Font family name e.g. 'Inter', 'Roboto', 'SF Pro Display' (default Inter). Must be a font installed in Figma.")),
		mcp.WithString("fontStyle", mcp.Description("Font style variant e.g. 'Regular', 'Bold', 'Italic', 'Medium', 'SemiBold' (default Regular). Must match an available style for the chosen fontFamily.")),
		mcp.WithString("fillColor", mcp.Description("Text color as hex e.g. #000000 (default black)")),
		mcp.WithString("name", mcp.Description("Node name shown in the layers panel (defaults to the text content)")),
		mcp.WithString("parentId", mcp.Description("Parent node ID in colon format. Defaults to current page.")),
	), makeArgsHandler(runtime, "create_text", nil))

	s.AddTool(mcp.NewTool("import_image",
		mcp.WithDescription("Import a base64-encoded image into Figma as a rectangle with an image fill. Use get_screenshot to capture images or provide your own base64 PNG/JPG."),
		mcp.WithString("imageData",
			mcp.Required(),
			mcp.Description("Base64-encoded image data (PNG or JPG)"),
		),
		mcp.WithNumber("x", mcp.Description("X position (default 0)")),
		mcp.WithNumber("y", mcp.Description("Y position (default 0)")),
		mcp.WithNumber("width", mcp.Description("Width in pixels (default 200)")),
		mcp.WithNumber("height", mcp.Description("Height in pixels (default 200)")),
		mcp.WithString("name", mcp.Description("Node name")),
		mcp.WithString("scaleMode", mcp.Description("Image scale mode: FILL (default), FIT, CROP, or TILE")),
		mcp.WithString("parentId", mcp.Description("Parent node ID in colon format. Defaults to current page.")),
	), makeArgsHandler(runtime, "import_image", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{
			"imageData": args["imageData"],
		}
		copyOptionalArg(params, args, "x", "y", "width", "height", "name", "scaleMode", "parentId")
		return params
	}))

	s.AddTool(mcp.NewTool("create_component",
		mcp.WithDescription("Convert an existing FRAME node into a reusable COMPONENT. The frame is replaced in place by the new component."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("FRAME node ID to convert, in colon format e.g. '4029:12345'"),
		),
		mcp.WithString("name", mcp.Description("Optional name for the component. Defaults to the frame's current name.")),
	), makeSingleNodeHandler(runtime, "create_component", "nodeId", true, func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		copyOptionalArg(params, args, "name")
		return params
	}))

	s.AddTool(mcp.NewTool("create_section",
		mcp.WithDescription("Create a Figma Section node on the current page. Sections are the modern way to organize frames and groups on a page."),
		mcp.WithString("name", mcp.Description("Section name (default 'Section')")),
		mcp.WithNumber("x", mcp.Description("X position (default 0)")),
		mcp.WithNumber("y", mcp.Description("Y position (default 0)")),
		mcp.WithNumber("width", mcp.Description("Width in pixels")),
		mcp.WithNumber("height", mcp.Description("Height in pixels")),
	), makeArgsHandler(runtime, "create_section", func(args map[string]interface{}) map[string]interface{} {
		params := map[string]interface{}{}
		copyOptionalArg(params, args, "name", "x", "y", "width", "height")
		return params
	}))
}
