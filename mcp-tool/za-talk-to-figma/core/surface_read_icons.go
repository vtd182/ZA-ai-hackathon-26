package core

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

var (
	iconPrefixes     = []string{"icon/", "icons/", "ic/", "ic_", "ic-"}
	iconSuffixes     = []string{"/icon", "_icon", "-icon", " icon"}
	sizeAnnotationRE = regexp.MustCompile(`[-_\s]?\d+(px|dp|pt|sp)?$`)
)

type IconMapEntry struct {
	Key  string `json:"key"`
	Name string `json:"name"`
	ID   string `json:"id"`
}

func registerReadIconTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("scan_icon_components",
		mcp.WithDescription("Scan a design system session for icon components. Returns an iconMap keyed by semantic name — use the key field with instantiate_component_by_key to place icons cross-file, or the id field with instantiate_component for same-file use.\n\nTwo modes:\n• No nameFilter: detects icons by naming convention (Icon/, ic_, ic-, icons/, etc.).\n• With nameFilter: overrides convention detection — includes ALL components whose name contains the filter string (separator-agnostic: 'zdc_ic' matches 'zdc_ic/', 'zdc-ic/', 'ZDC_IC/'). The filter prefix is stripped from semantic keys (e.g. filter='zdc_ic' + component='zdc_ic/home_24' → key='home'). Use this for design systems with custom icon prefixes like 'zdc_ic', 'mat_icon', 'fluent_icon', etc."),
		mcp.WithString("nameFilter", mcp.Description("Substring filter. Without it: only icon-named components (Icon/, ic_, etc.). With it: ALL components containing this string — use for custom prefixes like 'zdc_ic'.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		sessionID, _ := args["sessionId"].(string)
		rawFilter, _ := args["nameFilter"].(string)
		nameFilter := strings.ToLower(strings.TrimSpace(rawFilter))

		iconMap, err := scanIconComponents(ctx, runtime, sessionID, nameFilter)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		out, marshalErr := json.Marshal(map[string]any{
			"iconMap": iconMap,
			"count":   len(iconMap),
		})
		if marshalErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal scan_icon_components: %v", marshalErr)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})
}

func scanIconComponents(ctx context.Context, runtime *Runtime, sessionID, nameFilter string) (map[string]IconMapEntry, error) {
	components, _, _, err := fetchLocalDesignComponents(ctx, runtime, sessionID)
	if err != nil {
		return nil, fmt.Errorf("scan_icon_components: %w", err)
	}

	// Pre-normalize the filter so separator variants match (e.g. "zdc_ic" == "zdc-ic").
	normFilter := normalizeSeps(nameFilter)

	iconMap := map[string]IconMapEntry{}
	for _, comp := range components {
		lower := strings.ToLower(comp.Name)

		var semantic string
		if normFilter != "" {
			// nameFilter mode: skip icon-naming-convention detection entirely.
			// Any component whose normalized name contains the normalized filter is included.
			// This handles design systems with arbitrary icon prefixes (e.g. zdc_ic, mat_icon, etc.).
			if !strings.Contains(normalizeSeps(lower), normFilter) {
				continue
			}
			// Strip the filter prefix from the semantic name for cleaner map keys.
			// e.g. "zdc_ic/home_24" with filter "zdc_ic" → semantic "home"
			raw := normalizeIconSemanticName(lower)
			semantic = strings.TrimPrefix(raw, normFilter+"-")
			if semantic == raw {
				// Filter didn't appear as a leading segment; use the raw semantic.
				semantic = raw
			}
			semantic = strings.Trim(semantic, "-")
			if semantic == "" {
				semantic = raw
			}
		} else {
			if !looksLikeIconComponent(lower) {
				continue
			}
			semantic = normalizeIconSemanticName(lower)
		}

		if semantic == "" {
			continue
		}
		// Prefer published component (has key) over unpublished.
		if existing, ok := iconMap[semantic]; ok && existing.Key != "" && comp.Key == "" {
			continue
		}
		iconMap[semantic] = IconMapEntry{Key: comp.Key, Name: comp.Name, ID: comp.ID}
	}
	return iconMap, nil
}

// normalizeSeps converts /, _, space, . to - for separator-agnostic comparison.
func normalizeSeps(s string) string {
	return strings.NewReplacer("/", "-", "_", "-", " ", "-", ".", "-").Replace(strings.ToLower(s))
}

func looksLikeIconComponent(lower string) bool {
	for _, p := range iconPrefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	for _, s := range iconSuffixes {
		if strings.HasSuffix(lower, s) {
			return true
		}
	}
	// Exact token match only — avoids false positives like "iconography".
	// We deliberately do NOT use strings.Contains("icon") here.
	return lower == "icon" || lower == "icons"
}

func normalizeIconSemanticName(lower string) string {
	// Strip known leading prefixes.
	for _, p := range iconPrefixes {
		if strings.HasPrefix(lower, p) {
			lower = strings.TrimPrefix(lower, p)
			break
		}
	}
	// Strip known trailing suffixes.
	for _, s := range iconSuffixes {
		if strings.HasSuffix(lower, s) {
			lower = strings.TrimSuffix(lower, s)
			break
		}
	}
	// Strip trailing size annotations: "24", "24px", "-16", "_32dp".
	lower = sizeAnnotationRE.ReplaceAllString(lower, "")
	// Normalise all separators to hyphens.
	lower = strings.NewReplacer("/", "-", "_", "-", " ", "-", ".", "-").Replace(lower)
	// Collapse repeated hyphens and trim.
	for strings.Contains(lower, "--") {
		lower = strings.ReplaceAll(lower, "--", "-")
	}
	return strings.Trim(lower, "-")
}
