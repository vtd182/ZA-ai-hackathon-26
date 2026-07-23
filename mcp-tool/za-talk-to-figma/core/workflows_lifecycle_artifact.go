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

type lifecycleSnapshotSlot struct {
	SlotKey           string  `json:"slotKey"`
	ComponentKey      *string `json:"componentKey"`
	SemanticRole      *string `json:"semanticRole"`
	PrimitiveFallback bool    `json:"primitiveFallback"`
}

type lifecycleSnapshotScreen struct {
	NodeID       string                  `json:"nodeId"`
	ScreenID     string                  `json:"screenId"`
	Name         string                  `json:"name"`
	ComponentKey *string                 `json:"componentKey"`
	SemanticRole *string                 `json:"semanticRole"`
	Metadata     map[string]interface{}  `json:"metadata"`
	ChildSlots   []lifecycleSnapshotSlot `json:"childSlots"`
}

type lifecycleArtifactSnapshot struct {
	SchemaVersion  int                       `json:"schemaVersion"`
	TargetHash     string                    `json:"targetHash"`
	PlanHash       string                    `json:"planHash"`
	IdempotencyKey string                    `json:"idempotencyKey"`
	RootNodeIDs    []string                  `json:"rootNodeIds"`
	Screens        []lifecycleSnapshotScreen `json:"screens"`
	PrototypeEdges []lifecycleEdge           `json:"prototypeEdges"`
	ReadAt         string                    `json:"readAt"`
	Idempotent     bool                      `json:"idempotent,omitempty"`
}

type lifecycleAuditResult struct {
	Verified bool                      `json:"verified"`
	Issues   []lifecyclePreflightIssue `json:"issues"`
	Snapshot lifecycleArtifactSnapshot `json:"snapshot"`
}

func registerLifecycleArtifactTools(s *server.MCPServer, runtime *Runtime) {
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

	s.AddTool(mcp.NewTool("apply_design_system_plan",
		mcp.WithDescription("Apply an approved immutable lifecycle plan to the exact Figma sandbox target. Enforces approval hash and plugin-data idempotency before creating nodes."),
		mcp.WithObject("preflight", mcp.Required(), mcp.Description("Successful result returned by plan_design_system_screens.")),
		mcp.WithString("planHash", mcp.Required(), mcp.Description("Immutable preflight plan hash.")),
		mcp.WithString("approvedPlanHash", mcp.Required(), mcp.Description("Plan hash covered by the user's approval.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var preflight lifecyclePreflightResult
		if err := decodeInto(req.GetArguments()["preflight"], &preflight); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid preflight: %v", err)), nil
		}
		planHash, _ := req.GetArguments()["planHash"].(string)
		approvedPlanHash, _ := req.GetArguments()["approvedPlanHash"].(string)
		if err := validateApprovedLifecyclePreflight(preflight, planHash, approvedPlanHash); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		params := map[string]interface{}{
			"preflightPlan": preflight.Plan,
			"planHash":      planHash,
			"targetPageId":  preflight.Plan.Source.Target.PageID,
		}
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		resp, err := executeCapability(ctx, runtime, "apply_lifecycle_artifact_plan", nil, paramsWithSession(params, sessionID))
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("read_lifecycle_artifact",
		mcp.WithDescription("Read a bounded lifecycle artifact snapshot from Figma plugin data by idempotency key. This is independent of the apply response."),
		mcp.WithString("targetPageId", mcp.Required()),
		mcp.WithString("idempotencyKey", mcp.Required()),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		params := map[string]interface{}{
			"targetPageId":   req.GetArguments()["targetPageId"],
			"idempotencyKey": req.GetArguments()["idempotencyKey"],
		}
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		resp, err := executeCapability(ctx, runtime, "read_lifecycle_artifact", nil, paramsWithSession(params, sessionID))
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("audit_lifecycle_artifact",
		mcp.WithDescription("Read back and audit lifecycle metadata, component role bindings, primitive fallback policy and prototype edges against the immutable preflight plan."),
		mcp.WithObject("preflight", mcp.Required()),
		mcp.WithString("planHash", mcp.Required()),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var preflight lifecyclePreflightResult
		if err := decodeInto(req.GetArguments()["preflight"], &preflight); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid preflight: %v", err)), nil
		}
		planHash, _ := req.GetArguments()["planHash"].(string)
		if err := validateApprovedLifecyclePreflight(preflight, planHash, planHash); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		params := map[string]interface{}{
			"targetPageId":   preflight.Plan.Source.Target.PageID,
			"idempotencyKey": metadataString(preflight.Plan.Source.Metadata, "idempotencyKey"),
		}
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		resp, err := executeCapability(ctx, runtime, "read_lifecycle_artifact", nil, paramsWithSession(params, sessionID))
		if err != nil || resp.Error != "" {
			return renderResponse(resp, err)
		}
		var snapshot lifecycleArtifactSnapshot
		if err := decodeInto(resp.Data, &snapshot); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid lifecycle read-back: %v", err)), nil
		}
		result := auditLifecycleArtifact(preflight.Plan, planHash, snapshot)
		out, err := json.Marshal(result)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal audit_lifecycle_artifact: %v", err)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})
}

func paramsWithSession(params map[string]interface{}, sessionID string) map[string]interface{} {
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	return params
}

func hashLifecycleResolvedPlan(plan lifecycleResolvedPlan) (string, error) {
	payload, err := json.Marshal(plan)
	if err != nil {
		return "", err
	}
	var canonical interface{}
	if err := json.Unmarshal(payload, &canonical); err != nil {
		return "", err
	}
	canonicalPayload, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(canonicalPayload)
	return hex.EncodeToString(digest[:]), nil
}

func validateApprovedLifecyclePreflight(preflight lifecyclePreflightResult, planHash, approvedPlanHash string) error {
	if !preflight.Allowed {
		return fmt.Errorf("PREFLIGHT_BLOCKED: lifecycle plan contains policy errors")
	}
	recomputed, err := hashLifecycleResolvedPlan(preflight.Plan)
	if err != nil {
		return fmt.Errorf("hash lifecycle preflight: %w", err)
	}
	if planHash == "" || planHash != preflight.PlanHash || planHash != recomputed {
		return fmt.Errorf("PLAN_HASH_MISMATCH: preflight payload changed")
	}
	if approvedPlanHash != planHash {
		return fmt.Errorf("APPROVAL_HASH_MISMATCH: user approval does not cover this plan")
	}
	for _, issue := range preflight.Issues {
		if issue.Severity == "error" {
			return fmt.Errorf("PREFLIGHT_BLOCKED: %s", issue.Code)
		}
	}
	return nil
}

func metadataString(metadata map[string]interface{}, key string) string {
	value, _ := metadata[key].(string)
	return value
}

func auditLifecycleArtifact(plan lifecycleResolvedPlan, planHash string, snapshot lifecycleArtifactSnapshot) lifecycleAuditResult {
	issues := []lifecyclePreflightIssue{}
	add := func(code, message, entityID string) {
		issues = append(issues, lifecyclePreflightIssue{Code: code, Severity: "error", Message: message, EntityID: entityID})
	}
	if snapshot.TargetHash != plan.Source.Target.TargetHash {
		add("TARGET_MISMATCH", "Read-back target hash does not match the approved target.", "")
	}
	if snapshot.PlanHash != planHash {
		add("PLAN_HASH_MISMATCH", "Read-back plan hash does not match the approved plan.", "")
	}
	expectedIdempotency := metadataString(plan.Source.Metadata, "idempotencyKey")
	if snapshot.IdempotencyKey != expectedIdempotency {
		add("IDEMPOTENCY_MISMATCH", "Read-back idempotency key does not match the plan.", "")
	}
	if len(snapshot.RootNodeIDs) == 0 {
		add("MISSING_ARTIFACT_ROOT", "Read-back did not find a lifecycle artifact root.", "")
	}

	screensByID := map[string]lifecycleSnapshotScreen{}
	for _, screen := range snapshot.Screens {
		screensByID[screen.ScreenID] = screen
	}
	expectedSlots := map[string][]lifecycleResolvedSlot{}
	for _, slot := range plan.ResolvedSlots {
		expectedSlots[slot.ScreenID] = append(expectedSlots[slot.ScreenID], slot)
	}
	for _, expected := range plan.Source.Screens {
		actual, ok := screensByID[expected.ScreenID]
		if !ok {
			add("MISSING_SCREEN", "Expected lifecycle screen is missing from read-back.", expected.ScreenID)
			continue
		}
		if metadataString(actual.Metadata, "namespace") != "za.pm-lifecycle/v1" || metadataString(actual.Metadata, "screenId") != expected.ScreenID {
			add("MISSING_LIFECYCLE_METADATA", "Screen lifecycle namespace or screenId metadata is missing.", expected.ScreenID)
		}
		if metadataString(actual.Metadata, "runId") != metadataString(plan.Source.Metadata, "runId") || metadataString(actual.Metadata, "actionId") != metadataString(plan.Source.Metadata, "actionId") {
			add("LIFECYCLE_SCOPE_MISMATCH", "Screen run/action metadata does not match the plan.", expected.ScreenID)
		}
		actualRequirementIDs := stringSliceFromAny(actual.Metadata["requirementIds"])
		if !sameStrings(actualRequirementIDs, expected.RequirementIDs) {
			add("REQUIREMENT_METADATA_MISMATCH", "Screen requirement metadata does not match ProductSpec.", expected.ScreenID)
		}
		actualSlots := map[string]lifecycleSnapshotSlot{}
		for _, slot := range actual.ChildSlots {
			actualSlots[slot.SlotKey] = slot
		}
		for _, expectedSlot := range expectedSlots[expected.ScreenID] {
			actualSlot, ok := actualSlots[expectedSlot.SlotKey]
			if !ok {
				add("MISSING_SLOT", fmt.Sprintf("Expected slot %s is missing.", expectedSlot.SlotKey), expected.ScreenID)
				continue
			}
			if expectedSlot.ComponentKey != nil && (actualSlot.ComponentKey == nil || *actualSlot.ComponentKey != *expectedSlot.ComponentKey) {
				add("COMPONENT_BINDING_MISMATCH", fmt.Sprintf("Slot %s component binding does not match.", expectedSlot.SlotKey), expected.ScreenID)
			}
			if expectedSlot.SemanticRole != nil && (actualSlot.SemanticRole == nil || *actualSlot.SemanticRole != *expectedSlot.SemanticRole) {
				add("ROLE_BINDING_MISMATCH", fmt.Sprintf("Slot %s semantic role does not match.", expectedSlot.SlotKey), expected.ScreenID)
			}
			if plan.Source.Mode == "strict" && actualSlot.PrimitiveFallback {
				add("PRIMITIVE_FALLBACK", fmt.Sprintf("Strict slot %s used a primitive fallback.", expectedSlot.SlotKey), expected.ScreenID)
			}
		}
	}

	expectedEdges := map[string]bool{}
	for _, screen := range plan.Source.Screens {
		for _, edge := range screen.PrototypeEdges {
			expectedEdges[edge.Key] = true
		}
	}
	actualEdges := map[string]bool{}
	for _, edge := range snapshot.PrototypeEdges {
		actualEdges[edge.Key] = true
	}
	for edge := range expectedEdges {
		if !actualEdges[edge] {
			add("MISSING_PROTOTYPE_EDGE", fmt.Sprintf("Expected prototype edge %s is missing.", edge), "")
		}
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].Code != issues[j].Code {
			return issues[i].Code < issues[j].Code
		}
		return issues[i].EntityID < issues[j].EntityID
	})
	return lifecycleAuditResult{Verified: len(issues) == 0, Issues: issues, Snapshot: snapshot}
}

func stringSliceFromAny(value interface{}) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []interface{}:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if value, ok := item.(string); ok {
				out = append(out, value)
			}
		}
		return out
	default:
		return nil
	}
}

func sameStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	a := append([]string(nil), left...)
	b := append([]string(nil), right...)
	sort.Strings(a)
	sort.Strings(b)
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
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
	planHash, err := hashLifecycleResolvedPlan(resolvedPlan)
	if err != nil {
		return lifecyclePreflightResult{}, fmt.Errorf("hash resolved lifecycle plan: %w", err)
	}
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
	return lifecyclePreflightResult{Allowed: allowed, Plan: resolvedPlan, PlanHash: planHash, Issues: issues}, nil
}
