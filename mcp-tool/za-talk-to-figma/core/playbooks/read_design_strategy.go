package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addReadDesignStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("read_design_strategy",
		mcp.WithPromptDescription("Best practices for reading Figma designs with za-talk-to-figma"),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Best practices for reading Figma designs",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`To effectively read a Figma design with za-talk-to-figma:

1. If multiple Figma files or plugin runtimes may be connected, call get_runtime_sessions first and set_runtime_session before a long read sequence
2. Start with get_metadata — understand file name, pages, and current page
3. Use get_pages to list all pages without loading their full trees
4. Prefer inspect_selection_safely() when the user already selected a target region
5. Use get_design_context (depth=2, detail=compact) for a token-efficient summary of the current selection or page
   - detail=minimal: id/name/type/bounds only (~5% tokens)
   - detail=compact: + fills/strokes/opacity (~30% tokens)
   - detail=full: everything, default (100% tokens)
   - dedupe_components=true: INSTANCE nodes are collapsed to compact stubs (mainComponentId + componentProperties overrides);
     unique component structures are collected once in a top-level componentDefs map.
     Use this whenever the screen contains repeated component instances (e.g. card lists, table rows, nav items).
     Typical savings: 5–10× fewer tokens vs full serialization of repeated instances.
6. For screens with many repeated components, the recommended reading flow is:
   a. get_design_context(depth=2, detail=minimal, dedupe_components=true) — see the instance layout + component IDs
   b. Inspect componentDefs in the response — one definition per unique component, not one per instance
   c. Read componentProperties on each instance stub — variant selections, text overrides, boolean toggles
   d. Drill into specific instances with get_node only when an instance has unique overrides you need to inspect
7. If a read comes back partial, truncated, or fallbackUsed=true, switch to the large_file_recovery_strategy flow instead of repeating the same heavy read
8. Use search_nodes to find nodes by name or type without dumping the entire tree
9. Drill into specific nodes with get_node_context or get_nodes_info (prefer batch over single calls)
10. For text-heavy components, use scan_text_nodes to collect all copy at once
11. Use scan_nodes_by_types to find all FRAME/COMPONENT/INSTANCE nodes in a subtree
12. Call get_styles and get_variable_defs once per session to understand the design system
13. Call get_fonts to understand typography usage across the page at a glance
14. Use get_viewport to see what the user is currently looking at in the canvas
15. Use get_reactions to inspect prototype interactions on a node
16. Call get_screenshot last and only when visual confirmation is needed — it is expensive
17. Before saying a visual task is complete, call review_canvas_layout() so the real page structure is checked instead of trusting an isolated export
18. Node IDs use colon format: 4029:12345 — never use hyphens
19. get_local_components returns componentSets and variantProperties for variant-aware inspection`),
				),
			},
		), nil
	})
}
