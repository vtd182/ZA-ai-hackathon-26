package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addDesignStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("design_strategy",
		mcp.WithPromptDescription("Best practices for working with Figma designs"),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Best practices for working with Figma designs",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`When working with Figma designs, follow these rules strictly:

## 0. Session & file check (always first)
- If multiple Figma files may be connected, call get_runtime_sessions() and set_runtime_session() to confirm you are editing the right file.
- Call get_metadata() to verify the document, then get_pages() to list pages.
- If a selection exists, call inspect_selection_safely() before any full-page read.
- If a read returns partial/fallback results, switch to large_file_recovery_strategy — never repeat the same heavy call.

## 1. Design system first — always prefer instances over primitives
- Before drawing any element, check whether a design system is available:
  - Same file: call get_local_components() to list components. If components exist, use instantiate_component() instead of creating raw frames/text.
  - Cross-file: if a separate DS file is open, call capture_design_system_context (from that session) to get component keys, then instantiate_component_by_key() in the product session. See cross_session_ds_strategy for the step-by-step flow.
- Only fall back to primitives (create_frame, create_text, create_rectangle) when no matching DS component exists for that slot.
- After building a screen, call audit_design_system_adoption() to measure instance vs primitive ratio. Aim for zero primitive fallbacks.

## 2. Auto-layout on every container — no exceptions
- Every frame that holds children MUST have layoutMode set to "VERTICAL" or "HORIZONTAL".
  - Do NOT create a frame without layoutMode unless it is a leaf node with no children (e.g., a standalone image placeholder).
- Spacing: use multiples of 8px for itemSpacing and padding (8, 16, 24, 32, 48, 64).
- Set counterAxisSizingMode and primaryAxisSizingMode explicitly on every container.
- Wrap related elements (inputs, buttons, list items) in their own sub-frame with auto-layout before placing them inside a parent.

## 3. Naming — semantic and hierarchical
- Every node must have a descriptive name. Never leave nodes named "Frame", "Rectangle", "Text", "Group".
- Pattern: "<Screen> / <Section> / <Element>" (e.g., "Login / Input Group / Email Field").
- Name components and instances by role, not appearance ("Primary Button" not "Blue Rectangle").

## 4. Reusability — create components for repeated patterns
- If you create the same visual pattern more than once (card, list item, input field, button), call create_component() on the first instance, then use instantiate_component() for subsequent uses.
- Even in free-design mode, components make output reusable and easier to update.

## 5. Build order — structure before content
1. Create the top-level screen frame (with auto-layout VERTICAL).
2. Create section containers (header, body, footer) inside the screen.
3. Add content elements inside sections.
4. Apply fills, strokes, and styles last.
5. Verify the result with inspect_selection_safely() or review_canvas_layout() before concluding.

## 6. Spacing & visual hierarchy tokens
| Role          | Font size | Weight   | Color   |
|---------------|-----------|----------|---------|
| Screen title  | 24–32px   | Bold     | #0F172A |
| Section label | 16–18px   | Semibold | #1E293B |
| Body / label  | 14px      | Regular  | #344054 |
| Helper / hint | 12px      | Regular  | #667085 |

Standard padding: 24px screen edges. Standard gap between sections: 24px. Standard gap within a section: 12px.

## 7. Icons — three-tier fallback (NEVER use text/emoji for icons)
- Tier 1 (best): DS component — scan_icon_components(sessionId=dsSession) → instantiate_component_by_key / instantiate_component
- Tier 2: SVG import — import_svg(svgContent="<svg>...", name="Icon / Search", size=24)
- Tier 3 (last resort): create_icon_placeholder(name="search", size=24) — creates a named frame the user can replace
- See icon_strategy playbook for SVG paths for 15+ common icons (search, close, arrow, home, user, check, etc.)

## 8. Verification
- Call review_canvas_layout() before finishing any multi-element task.
- Call audit_design_system_adoption() after any screen that should use DS components.
- All write operations are undoable (Ctrl/Cmd+Z). Verify early and often rather than undoing large batches.

## Example: well-structured screen hierarchy
- Login Screen (FRAME, auto-layout VERTICAL, padding 24, gap 24)
  - Header (FRAME, auto-layout VERTICAL, gap 8)
    - App Logo (INSTANCE of Logo/Default)
    - Welcome Title (INSTANCE of Text/Heading or TEXT node named "Login / Header / Title")
  - Input Group (FRAME, auto-layout VERTICAL, gap 12)
    - Email Field (INSTANCE of Input/Default)
    - Password Field (INSTANCE of Input/Password)
  - Actions (FRAME, auto-layout VERTICAL, gap 8)
    - Login Button (INSTANCE of Button/Primary)
    - Forgot Password (INSTANCE of Link/Default or TEXT named "Login / Actions / Forgot Password")`),
				),
			},
		), nil
	})
}
