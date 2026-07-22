package core

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerGeneratorTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("generate_zinstant",
		mcp.WithDescription(`Read a Figma node and either extract its data for AI-driven code generation, or write a scaffold project.

## Recommended workflow — extractOnly=true (AI writes code)

Use this mode when the user has an existing Zinstant template project in the workspace (recognized by a zinstantconfig.json at the root). The tool returns structured Figma data; the AI then writes the ZHTML/TS files directly into the template using the zinstant-development skill.

1. Call generate_zinstant(nodeId=..., extractOnly=true) — returns {target, textBindings, templateRoot, ...}
2. Read the existing template: zinstantconfig.json, zhtml/index.zhtml, src/index.ts
3. Apply zinstant-development skill rules (wrapper pattern, dark mode, navigation, IDs)
4. Write updated files with the Write tool

## Scaffold mode — extractOnly=false (default, standalone project)

Writes a complete Zinstant project scaffold to outputDir. If zinstantconfig.json already exists at the workspace root, writes into that project (template mode); otherwise creates generated/zinstant/<screen-name>/. Files are overwritten if they already exist.`),
		mcp.WithString("nodeId",
			mcp.Description("Optional source node ID in colon format. If omitted, uses the first selected node, otherwise falls back to the current page."),
		),
		mcp.WithString("outputDir",
			mcp.Description("Optional output directory inside the workspace. Defaults to the template root (if zinstantconfig.json found) or generated/zinstant/<screen-name>."),
		),
		mcp.WithString("mode",
			mcp.Description("Optional explicit mode. Supported modes: free, za_guard, gen.zinstant, gen.custom."),
		),
		mcp.WithString("promptMode",
			mcp.Description("Optional prompt-derived mode override. Only used when allowPromptModeOverride is enabled in za-talk-to-figma.json."),
		),
		mcp.WithString("screenName",
			mcp.Description("Optional logical name used for the output folder and project metadata."),
		),
		mcp.WithBoolean("extractOnly",
			mcp.Description("When true, return the Figma node tree and text bindings as structured data without writing any files. Use this with extractOnly=true when the user has an existing template project and the AI will write the ZHTML/TS files."),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeGenerateZinstant(ctx, runtime, req)
	})
}
