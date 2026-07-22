package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addIconStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("icon_strategy",
		mcp.WithPromptDescription("Three-tier fallback strategy for placing icons: DS component → SVG import → placeholder. Never use text/emoji."),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Icon handling strategy",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`# Icon strategy — three-tier fallback

NEVER use text nodes (emoji, unicode characters) to represent icons.
Always follow this priority order:

---

## Tier 1 — DS icon component (best quality, live-linked)

Use when a Design System is connected.

### Same file
  get_local_components()               ← list all DS components
  → filter names containing "icon", "ic_", "Icon/" etc.
  → find the closest semantic match
  → instantiate_component(componentId=..., parentId=...)

### Cross-file (DS file open in separate session)

**Option A — SVG copy (works without published library, RECOMMENDED for icons):**
  scan_icon_components(sessionId=dsSession, nameFilter="zdc_ic")
  → returns iconMap["home"] = { key, name, id }
  → export_node_as_svg(nodeId=iconMap["home"].id, sessionId=dsSession)
  → import_svg(svgContent=result.svgContent, sessionId=prodSession, parentId=..., size=24)

This is the same mechanism as Figma's own copy-paste. No library setup needed.
For Zalo DS icons use nameFilter="zdc_ic"; for Material use nameFilter="mat_icon"; etc.

**Option B — Live instance (requires published Team Library):**
  scan_icon_components(sessionId=dsSession, nameFilter="zdc_ic")
  → returns iconMap["home"] = { key, name, id }
  → instantiate_component_by_key(key=iconMap["home"].key, sessionId=prodSession, parentId=...)

scan_icon_components normalises naming automatically — Icon/Search, ic_search,
zdc_ic/search_24, search_ic_24 all resolve to semantic key "search".

---

## Tier 2 — SVG import (good quality, no DS needed)

Use when no DS is available or the icon is not in the DS.

  import_svg(
    svgContent: '<svg viewBox="0 0 24 24" fill="none" ...><path .../></svg>',
    name: "Icon / Search",
    size: 24,
    parentId: ...
  )

Common SVG paths you can generate for standard icons:

search:    <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
close:     <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
arrow-right: <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
arrow-left:  <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
check:     <path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
home:      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2"/>
user:      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
settings:  <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2"/>
bell:      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
heart:     <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2"/>
menu:      <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
plus:      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
trash:     <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2"/>

Wrap all paths inside: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">...</svg>

---

## Tier 3 — Placeholder frame (last resort)

Use ONLY when tier 1 and tier 2 are both unavailable.

  create_icon_placeholder(name="search", size=24, parentId=...)

This creates a named 24×24 frame the user can replace later.
Name it correctly so it is easy to find: "Icon / Search", "Icon / Close", etc.

---

## Decision tree (follow in order)

1. Is a DS session connected with icon components?
   YES → scan_icon_components() → instantiate_component_by_key / instantiate_component
   NO  → go to 2

2. Can I write SVG for this icon?
   YES → import_svg(svgContent=..., name="Icon / X", size=24)
   NO  → go to 3

3. create_icon_placeholder(name="X", size=24)
   → add a comment so the user knows to replace it`),
				),
			},
		), nil
	})
}
