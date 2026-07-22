package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addDesignReferenceStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("design_reference_strategy",
		mcp.WithPromptDescription("Use DESIGN.md and canvas-truth together so AI-generated design guidance stays grounded"),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Use DESIGN.md and canvas-truth together",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`# Design Reference Strategy

Use this workflow when the project includes a `+"`DESIGN.md`"+` file or another markdown design reference such as a file adapted from awesome-design-md.

## Goal

Keep AI design output stylistically consistent **without** blindly copying a reference and **without** skipping real Figma canvas verification.

## Rules

1. If a `+"`DESIGN.md`"+` file exists in the workspace, read it first.
2. Treat `+"`DESIGN.md`"+` as **taste guidance**, not as a pixel source of truth.
3. Treat the active Figma canvas as the **current visual truth**.
4. If `+"`DESIGN.md`"+` conflicts with the current canvas, call out the mismatch and choose one explicitly.
5. Before concluding a visual task, run a canvas review flow:
   - get_metadata()
   - get_viewport()
   - review_canvas_layout()

## Recommended workflow

### A. Load design guidance
- Check whether a `+"`DESIGN.md`"+` file exists in the repo root.
- Extract:
  - brand mood
  - spacing rhythm
  - typography hierarchy
  - preferred component shapes
  - color and contrast rules

### B. Read the Figma context safely
- Start with get_metadata()
- Use inspect_selection_safely() for selected work
- Use review_canvas_layout() before concluding or exporting
- Prefer context-safe tools over full-tree reads on large files

### C. Generate or modify
- Apply the taste guidance from `+"`DESIGN.md`"+`
- But preserve the real structural constraints of the selected Figma context
- Do not claim fidelity based only on screenshots or exports of isolated nodes

### D. Final verification
- Re-read the actual canvas
- Check for:
  - overlap
  - spacing drift
  - stray top-level nodes
  - hierarchy mismatch
- Only then summarize the result

## Notes on awesome-design-md

Files inspired by awesome-design-md are useful as:
- visual tone guides
- spacing/type heuristics
- component shape defaults

They are **not** a replacement for:
- Figma selection context
- actual canvas review
- project-specific UI constraints
`),
				),
			},
		), nil
	})
}
