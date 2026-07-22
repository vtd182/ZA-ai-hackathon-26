package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addCrossSessionDSStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("cross_session_ds_strategy",
		mcp.WithPromptDescription("Step-by-step workflow for reusing components from a Design System file (session A) when building in a product file (session B)"),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Cross-file Design System reuse workflow",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`# Cross-session Design System strategy

Use this workflow when two Figma files are open: one holds the Design System (DS),
the other is the product screen you are building. The goal is to place real DS
component instances in the product file, not copies or primitives.

## Prerequisites
- Both Figma files must have the za-talk-to-figma plugin running.
- The DS file's components must be published to the team library
  (Figma → Assets panel → Publish) so that importComponentByKeyAsync can
  import them cross-file. If the DS is NOT published, fall back to the
  same-file strategy (capture → apply within one file).

---

## Step 1 — Discover sessions
Call get_runtime_sessions() and identify:
- dsSessionId   → the session whose file name or page contains the design system
- prodSessionId → the session where you will build the product screen

If only one session is listed, both files must be open in Figma with the plugin
running in each. Ask the user to open the DS file and run the plugin there too.

---

## Step 2 — Capture DS context from the DS session
Switch to the DS session and scan for components:

  capture_design_system_context(
    sessionId     = dsSessionId,
    sourcePageId  = <DS page ID>   // use get_pages(sessionId=dsSessionId) to find it
  )

The response contains:
- relevantComponents[].key   — stable cross-file component key
- relevantComponents[].name  — human-readable name
- semanticHints[].roles      — inferred roles: button, input, title, helper, …

Save the full response as dsContext. You will use component keys in step 4.

---

## Step 3 — Switch to the product session
  set_runtime_session(sessionId = prodSessionId)

All subsequent calls now target the product file.

---

## Step 4 — Copy DS components to the product file

### Option A: SVG copy (RECOMMENDED — works without publishing)
For vector components and icons, export as SVG from the DS session and import
in the product session. This mirrors Figma's own copy-paste behavior and
requires NO published library:

  // In DS session — get the node ID from dsContext or scan_icon_components
  result = export_node_as_svg(
    sessionId = dsSessionId,
    nodeId    = <component or icon node ID>
  )

  // In product session — place the vector copy
  import_svg(
    sessionId  = prodSessionId,
    svgContent = result.svgContent,
    name       = <meaningful name>,
    parentId   = <parent frame ID>,
    x          = <x>, y = <y>
  )

This gives a true vector copy — scalable, editable paths, no rasterization.
For icons from a DS (e.g. zdc_ic/*): scan_icon_components gives the IDs,
then loop export_node_as_svg → import_svg for each icon needed.

### Option B: Live instances via Team Library (requires publishing)
If the DS file is published as a Figma Team Library AND enabled in the product
file (Resources panel → Libraries), use instantiate_component_by_key:

  instantiate_component_by_key(
    sessionId = prodSessionId,
    key       = <component.key from dsContext>,
    parentId  = <parent frame ID in prod file>,
    x         = <optional x>,
    y         = <optional y>
  )

This creates a live INSTANCE that updates whenever the DS component changes.
Prefer this for components that should stay in sync with the design system.
Use Option A for icons and one-off copies.

Repeat for every slot: title, inputs, buttons, helper text, icons, etc.

---

## Step 5 — Fill remaining slots with primitives (last resort)
If a DS component has no matching role for a slot, create it as a styled
primitive (create_frame / create_text) and flag it as a missing mapping so the
user knows which slots still need DS coverage.

---

## Step 6 — Audit adoption
  audit_design_system_adoption(
    sessionId  = prodSessionId,
    rootNodeId = <screen frame ID>
  )

Review instanceBasedCount vs primitiveFallbackCount. Ideally primitiveFallbackCount = 0.

---

## Fallback: DS not published (IMPORTANT — this is the common case)
importComponentByKeyAsync only works when the source file is published as a
Figma Team Library. A file that is merely **open in another tab** is NOT a
published library, even if the plugin can read its components.

**How to tell the user:**
"The design system file must be published as a Figma Team Library for cross-file
component reuse. Go to the DS file → Main menu → Libraries → Publish."

**Immediate workaround if user cannot publish:**

Option A — Screenshot-copy (rasterized, instant):
1. In DS session: get_screenshot(nodeId=<component ID>, sessionId=dsSessionId)
   — returns base64 PNG of the component.
2. In product session: import_image(imageData=<base64>, sessionId=prodSessionId,
   width=<component width>, height=<component height>)
   — places a rasterized image. Not live-linked but visually accurate.

Option B — Rebuild from context (structural, editable):
1. In DS session: get_node_context(nodeId=<component ID>, sessionId=dsSessionId)
   — returns full structure: fills, strokes, children, text, fonts.
2. In product session: recreate using create_frame / create_text / set_fills
   matching the DS component's exact properties.

For icons specifically: use scan_icon_components(sessionId=dsSessionId) to get
the icon visual via get_screenshot, then import_image in prodSession.

---

## Quick reference — tool sequence
1. get_runtime_sessions()
2. get_pages(sessionId=dsSessionId)
3. capture_design_system_context(sessionId=dsSessionId, sourcePageId=…)
4. set_runtime_session(sessionId=prodSessionId)
5. [for each slot] instantiate_component_by_key(key=…, parentId=…)
6. audit_design_system_adoption(rootNodeId=…)`),
					),
				},
			), nil
		})
}
