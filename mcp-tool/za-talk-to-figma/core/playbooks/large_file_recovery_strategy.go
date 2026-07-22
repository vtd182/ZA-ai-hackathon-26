package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addLargeFileRecoveryStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("large_file_recovery_strategy",
		mcp.WithPromptDescription("Recovery strategy for large Figma files, deep nodes, and partial runtime reads"),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Recovery strategy for large Figma files",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`Use this recovery flow when a Figma file is large, a node is deeply nested, or a read returns partial/fallback results.

## Rules

1. Do not keep retrying the same full-tree read blindly.
2. Prefer selection-first or context-first reads over page-wide reads.
3. Treat partial results as useful state, not as failure.
4. Use review_canvas_layout() before concluding visual work, even after recovery.

## Recovery order

### 1. Selection-first
- If the user has already selected a region, start with inspect_selection_safely().
- Avoid get_document() unless the task truly needs the entire page tree.

### 2. Context fallback
- Prefer get_node_context() over get_node() for heavy or repeated reads.
- Prefer get_design_context() over get_document() for page summaries.

### 3. Inventory before drilling
- If the page feels heavy or unclear, call safe_page_inventory() first.
- Use the result to decide which subtree is worth drilling into.

### 4. Extraction guidance
- When the user wants system structure or repeated patterns, use extract_component_candidates() instead of scanning the whole page manually.

### 5. Recovery from partial reads
If a result includes:
- truncated=true
- fallbackUsed=true
- recommendedNextCalls

Then:
- acknowledge that the runtime degraded intentionally
- use the recommended next call instead of repeating the original request
- keep working from the partial data that already came back

## Goal

The runtime should degrade gracefully:
- summary first
- context next
- targeted drill-down last
`),
				),
			},
		), nil
	})
}
