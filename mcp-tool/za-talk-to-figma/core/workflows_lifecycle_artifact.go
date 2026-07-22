package core

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type lifecycleTarget struct {
	SchemaVersion int    `json:"schemaVersion"`
	TargetHash    string `json:"targetHash"`
	SessionID     string `json:"sessionId"`
	FileName      string `json:"fileName"`
	PageID        string `json:"pageId"`
	PageName      string `json:"pageName"`
	AllowedAt     string `json:"allowedAt"`
}

type lifecycleSlot struct {
	Key               string            `json:"key"`
	Label             string            `json:"label"`
	Required          bool              `json:"required"`
	RequiredRoles     []string          `json:"requiredRoles"`
	PreferredRoles    []string          `json:"preferredRoles"`
	VariantProperties map[string]string `json:"variantProperties"`
	Content           map[string]string `json:"content"`
	Children          []lifecycleSlot   `json:"children"`
}

type lifecycleEdge struct {
	Key          string `json:"key"`
	FromScreenID string `json:"fromScreenId"`
	ToScreenID   string `json:"toScreenId"`
	Trigger      string `json:"trigger"`
	Action       string `json:"action"`
}

type lifecycleScreenRecipe struct {
	SchemaVersion  int             `json:"schemaVersion"`
	ScreenID       string          `json:"screenId"`
	Name           string          `json:"name"`
	Purpose        string          `json:"purpose"`
	RequirementIDs []string        `json:"requirementIds"`
	Layout         string          `json:"layout"`
	Sequence       int             `json:"sequence"`
	Slots          []lifecycleSlot `json:"slots"`
	PrototypeEdges []lifecycleEdge `json:"prototypeEdges"`
}

type lifecycleArtifactPlan struct {
	SchemaVersion       int                     `json:"schemaVersion"`
	Kind                string                  `json:"kind"`
	Mode                string                  `json:"mode"`
	Target              lifecycleTarget         `json:"target"`
	ManifestFingerprint string                  `json:"manifestFingerprint"`
	RequiredTokens      []string                `json:"requiredTokens"`
	Screens             []lifecycleScreenRecipe `json:"screens"`
	Metadata            map[string]interface{}  `json:"metadata"`
}

type lifecycleManifestComponent struct {
	Key          string `json:"key"`
	SemanticRole string `json:"semanticRole"`
	Deprecated   bool   `json:"deprecated"`
}

type lifecycleManifestToken struct {
	Name string `json:"name"`
}

type lifecycleManifestTokens struct {
	Color      []lifecycleManifestToken `json:"color"`
	Typography []lifecycleManifestToken `json:"typography"`
	Spacing    []lifecycleManifestToken `json:"spacing"`
	Radius     []lifecycleManifestToken `json:"radius"`
}

type lifecycleManifest struct {
	Fingerprint        string                       `json:"fingerprint"`
	Components         []lifecycleManifestComponent `json:"components"`
	Tokens             lifecycleManifestTokens      `json:"tokens"`
	ForbiddenRawStyles bool                         `json:"forbiddenRawStyles"`
}

type lifecyclePreflightIssue struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	EntityID string `json:"entityId,omitempty"`
}

type lifecycleResolvedSlot struct {
	ScreenID     string  `json:"screenId"`
	SlotKey      string  `json:"slotKey"`
	Required     bool    `json:"required"`
	ComponentKey *string `json:"componentKey"`
	SemanticRole *string `json:"semanticRole"`
	Resolution   string  `json:"resolution"`
}

type lifecycleResolvedPlan struct {
	SchemaVersion       int                     `json:"schemaVersion"`
	Source              lifecycleArtifactPlan   `json:"source"`
	ResolvedSlots       []lifecycleResolvedSlot `json:"resolvedSlots"`
	ResolvedTokens      []string                `json:"resolvedTokens"`
	EstimatedOperations int                     `json:"estimatedOperations"`
}

type lifecyclePreflightResult struct {
	Allowed  bool                      `json:"allowed"`
	Plan     lifecycleResolvedPlan     `json:"plan"`
	PlanHash string                    `json:"planHash"`
	Issues   []lifecyclePreflightIssue `json:"issues"`
}

func registerLifecycleArtifactTools(s *server.MCPServer) {
	s.AddTool(mcp.NewTool("plan_design_system_screens",
		mcp.WithDescription("Read-only strict preflight for generic lifecycle screen recipes. Resolves semantic component roles and tokens, validates the exact allowlisted target, and returns an immutable plan hash without mutating Figma."),
		mcp.WithObject("artifactPlan", mcp.Required(), mcp.Description("Versioned semantic Figma artifact plan. Coordinates and raw component IDs are not accepted.")),
		mcp.WithObject("manifest", mcp.Required(), mcp.Description("Bounded normalized design-system manifest captured from an allowed source or explicit fixture fallback.")),
		mcp.WithObject("allowedTarget", mcp.Required(), mcp.Description("Exact target binding previously approved by the host application.")),
		withOptionalSessionTarget(),
	), func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var plan lifecycleArtifactPlan
		if err := decodeInto(req.GetArguments()["artifactPlan"], &plan); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid artifactPlan: %v", err)), nil
		}
		var manifest lifecycleManifest
		if err := decodeInto(req.GetArguments()["manifest"], &manifest); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid manifest: %v", err)), nil
		}
		var allowedTarget lifecycleTarget
		if err := decodeInto(req.GetArguments()["allowedTarget"], &allowedTarget); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid allowedTarget: %v", err)), nil
		}
		if sessionID, _ := req.GetArguments()["sessionId"].(string); sessionID != "" && sessionID != plan.Target.SessionID {
			allowedTarget.SessionID = sessionID
		}
		result, err := planLifecycleDesignSystemScreens(plan, manifest, allowedTarget)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		out, err := json.Marshal(result)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal plan_design_system_screens: %v", err)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})
}

func planLifecycleDesignSystemScreens(plan lifecycleArtifactPlan, manifest lifecycleManifest, allowedTarget lifecycleTarget) (lifecyclePreflightResult, error) {
	if plan.SchemaVersion != 1 || plan.Kind != "figma_design_system_plan" {
		return lifecyclePreflightResult{}, fmt.Errorf("unsupported lifecycle artifact plan schema")
	}
	if plan.Mode != "strict" && plan.Mode != "free" {
		return lifecyclePreflightResult{}, fmt.Errorf("mode must be strict or free")
	}
	if len(plan.Screens) == 0 {
		return lifecyclePreflightResult{}, fmt.Errorf("artifact plan must include at least one screen")
	}

	issues := []lifecyclePreflightIssue{}
	if plan.Target.TargetHash == "" || plan.Target.TargetHash != allowedTarget.TargetHash || plan.Target.SessionID != allowedTarget.SessionID || plan.Target.PageID != allowedTarget.PageID {
		issues = append(issues, lifecyclePreflightIssue{Code: "TARGET_NOT_ALLOWED", Severity: "error", Message: "Figma target does not match the exact host allowlist."})
	}
	if plan.ManifestFingerprint == "" || plan.ManifestFingerprint != manifest.Fingerprint {
		issues = append(issues, lifecyclePreflightIssue{Code: "MANIFEST_CHANGED", Severity: "error", Message: "Design-system manifest fingerprint changed after planning."})
	}

	componentsByRole := map[string]lifecycleManifestComponent{}
	deprecatedRoles := map[string]bool{}
	for _, component := range manifest.Components {
		role := strings.TrimSpace(component.SemanticRole)
		if role == "" {
			continue
		}
		if component.Deprecated {
			deprecatedRoles[role] = true
			continue
		}
		if _, exists := componentsByRole[role]; !exists {
			componentsByRole[role] = component
		}
	}

	resolvedSlots := []lifecycleResolvedSlot{}
	edgeCount := 0
	for _, screen := range plan.Screens {
		if strings.TrimSpace(screen.ScreenID) == "" || len(screen.Slots) == 0 {
			return lifecyclePreflightResult{}, fmt.Errorf("every screen requires an ID and at least one semantic slot")
		}
		edgeCount += len(screen.PrototypeEdges)
		seenSlots := map[string]bool{}
		for _, slot := range screen.Slots {
			if strings.TrimSpace(slot.Key) == "" || len(slot.RequiredRoles) == 0 || seenSlots[slot.Key] {
				return lifecyclePreflightResult{}, fmt.Errorf("screen %s contains an invalid or duplicate slot", screen.ScreenID)
			}
			seenSlots[slot.Key] = true
			var matched *lifecycleManifestComponent
			for _, role := range append(slot.RequiredRoles, slot.PreferredRoles...) {
				if component, ok := componentsByRole[role]; ok {
					copy := component
					matched = &copy
					break
				}
			}
			resolved := lifecycleResolvedSlot{ScreenID: screen.ScreenID, SlotKey: slot.Key, Required: slot.Required, Resolution: "missing"}
			if matched != nil {
				resolved.ComponentKey = &matched.Key
				resolved.SemanticRole = &matched.SemanticRole
				resolved.Resolution = "component"
			} else {
				severity := "warning"
				if plan.Mode == "strict" && slot.Required {
					severity = "error"
				} else {
					resolved.Resolution = "primitive_fallback"
				}
				code := "MISSING_COMPONENT_ROLE"
				for _, role := range slot.RequiredRoles {
					if deprecatedRoles[role] {
						code = "DEPRECATED_COMPONENT"
						break
					}
				}
				issues = append(issues, lifecyclePreflightIssue{Code: code, Severity: severity, Message: fmt.Sprintf("No allowed component resolves slot %s (%s).", slot.Key, strings.Join(slot.RequiredRoles, ", ")), EntityID: screen.ScreenID})
			}
			resolvedSlots = append(resolvedSlots, resolved)
		}
	}

	tokenSet := map[string]bool{}
	for _, list := range [][]lifecycleManifestToken{manifest.Tokens.Color, manifest.Tokens.Typography, manifest.Tokens.Spacing, manifest.Tokens.Radius} {
		for _, token := range list {
			tokenSet[token.Name] = true
		}
	}
	resolvedTokens := []string{}
	for _, token := range plan.RequiredTokens {
		if tokenSet[token] {
			resolvedTokens = append(resolvedTokens, token)
		} else {
			issues = append(issues, lifecyclePreflightIssue{Code: "MISSING_TOKEN", Severity: "error", Message: fmt.Sprintf("Required token is missing: %s.", token)})
		}
	}
	if !manifest.ForbiddenRawStyles {
		issues = append(issues, lifecyclePreflightIssue{Code: "RAW_STYLE_POLICY_DISABLED", Severity: "warning", Message: "Manifest does not explicitly forbid raw styles."})
	}

	resolvedPlan := lifecycleResolvedPlan{
		SchemaVersion:       1,
		Source:              plan,
		ResolvedSlots:       resolvedSlots,
		ResolvedTokens:      resolvedTokens,
		EstimatedOperations: len(plan.Screens) + len(resolvedSlots) + edgeCount,
	}
	payload, err := json.Marshal(resolvedPlan)
	if err != nil {
		return lifecyclePreflightResult{}, fmt.Errorf("marshal resolved lifecycle plan: %w", err)
	}
	digest := sha256.Sum256(payload)
	allowed := true
	for _, issue := range issues {
		if issue.Severity == "error" {
			allowed = false
			break
		}
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].Severity != issues[j].Severity {
			return issues[i].Severity == "error"
		}
		if issues[i].Code != issues[j].Code {
			return issues[i].Code < issues[j].Code
		}
		return issues[i].EntityID < issues[j].EntityID
	})
	return lifecyclePreflightResult{Allowed: allowed, Plan: resolvedPlan, PlanHash: hex.EncodeToString(digest[:]), Issues: issues}, nil
}
