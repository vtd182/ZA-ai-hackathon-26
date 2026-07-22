package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type dsLocalComponent struct {
	ID                string                 `json:"id"`
	Name              string                 `json:"name"`
	Key               string                 `json:"key,omitempty"`
	ComponentSetID    string                 `json:"componentSetId,omitempty"`
	VariantProperties map[string]interface{} `json:"variantProperties,omitempty"`
}

type dsComponentSet struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key,omitempty"`
}

type dsScannedNode struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Type       string      `json:"type"`
	Bounds     *zGenBounds `json:"bounds,omitempty"`
	ChildCount int         `json:"childCount,omitempty"`
}

type dsTextNode struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Characters string      `json:"characters,omitempty"`
	FontSize   interface{} `json:"fontSize,omitempty"`
	FontName   interface{} `json:"fontName,omitempty"`
}

type dsSemanticHint struct {
	ComponentID string   `json:"componentId"`
	Name        string   `json:"name"`
	Roles       []string `json:"roles"`
}

type dsContextBundle struct {
	SourceRoot           smartSelectionNode        `json:"sourceRoot"`
	RelevantComponents   []dsLocalComponent        `json:"relevantComponents"`
	RelevantComponentSet []dsComponentSet          `json:"relevantComponentSets"`
	Styles               interface{}               `json:"styles"`
	Variables            interface{}               `json:"variables"`
	TextNodes            []dsTextNode              `json:"textNodes"`
	SemanticHints        []dsSemanticHint          `json:"semanticHints"`
	Warnings             []string                  `json:"warnings"`
	ExecutionReports     []ExecutionReport         `json:"executionReports"`
	HintByComponentID    map[string][]string       `json:"hintByComponentId"`
	ScannedNodes         []dsScannedNode           `json:"scannedNodes"`
	ComponentSetByID     map[string]dsComponentSet `json:"componentSetById"`
}

type dsAdoptionSummary struct {
	InstanceBasedCount     int      `json:"instanceBasedCount"`
	StyleBoundCount        int      `json:"styleBoundCount"`
	PrimitiveFallbackCount int      `json:"primitiveFallbackCount"`
	MissingMappings        []string `json:"missingMappings"`
}

type dsRecipeSlot struct {
	Key           string
	Label         string
	RequiredRoles []string
	PreferredRoles []string
}

type dsComponentMatch struct {
	Component dsLocalComponent
	Roles     []string
	Score     int
}

func registerDesignSystemTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("capture_design_system_context",
		mcp.WithDescription("Capture a same-file design-system context from a source page or root node. Returns relevant local components, styles, variables, text cues, and semantic hints for later DS application."),
		mcp.WithString("sourcePageId", mcp.Description("Source PAGE node ID in colon format.")),
		mcp.WithString("sourceRootNodeId", mcp.Description("Optional source root node ID in colon format. Overrides sourcePageId when provided.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		bundle, err := captureDesignSystemContext(ctx, runtime, req.GetArguments(), sessionID)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		out, marshalErr := json.Marshal(bundle)
		if marshalErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal capture_design_system_context: %v", marshalErr)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})

	s.AddTool(mcp.NewTool("apply_design_system_screen",
		mcp.WithDescription("Apply a same-file design-system context from one page/root to another page/root using an instance-first workflow. Leaf controls prefer real DS instances before any fallback."),
		mcp.WithString("sourcePageId", mcp.Description("Source PAGE node ID in colon format.")),
		mcp.WithString("sourceRootNodeId", mcp.Description("Optional source root node ID in colon format. Overrides sourcePageId when provided.")),
		mcp.WithObject("sourceContext", mcp.Description("Optional previously captured design-system context object from capture_design_system_context.")),
		mcp.WithString("targetPageId", mcp.Description("Target PAGE node ID where the screen wrapper should be created.")),
		mcp.WithString("targetParentId", mcp.Description("Optional target parent node ID. Overrides targetPageId when provided.")),
		mcp.WithString("screenIntent", mcp.Description("Screen intent, e.g. register_account.")),
		mcp.WithString("recipe", mcp.Description("Alias for screenIntent. e.g. register_account.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		result, err := applyDesignSystemScreen(ctx, runtime, req.GetArguments(), sessionID)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		out, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal apply_design_system_screen: %v", marshalErr)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})

	s.AddTool(mcp.NewTool("audit_design_system_adoption",
		mcp.WithDescription("Audit whether a subtree is actually design-system-backed. Reports instance-based, style-bound, and primitive fallback counts for the target subtree."),
		mcp.WithString("rootNodeId", mcp.Required(), mcp.Description("Root node ID of the rendered screen or subtree to audit.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		rootNodeID, _ := req.GetArguments()["rootNodeId"].(string)
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		result, err := auditDesignSystemAdoption(ctx, runtime, rootNodeID, sessionID)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		out, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal audit_design_system_adoption: %v", marshalErr)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	})
}

func captureDesignSystemContext(ctx context.Context, runtime *Runtime, args map[string]interface{}, sessionID string) (dsContextBundle, error) {
	sourceRootID, err := resolveDesignSystemSourceRootID(args)
	if err != nil {
		return dsContextBundle{}, err
	}

	rootNode, rootReport, err := fetchSmartNodeSummary(ctx, runtime, sourceRootID, sessionID)
	if err != nil {
		return dsContextBundle{}, err
	}

	reports := []ExecutionReport{rootReport}
	scannedNodes, scanReport, err := fetchSourceDesignSystemNodes(ctx, runtime, sourceRootID, sessionID)
	if err != nil {
		return dsContextBundle{}, err
	}
	reports = append(reports, scanReport)

	textNodes, textReport, err := fetchSourceTextNodes(ctx, runtime, sourceRootID, sessionID)
	if err == nil {
		reports = append(reports, textReport)
	}

	localComponents, localSets, componentReport, err := fetchLocalDesignComponents(ctx, runtime, sessionID)
	if err != nil {
		return dsContextBundle{}, err
	}
	reports = append(reports, componentReport)

	styles, stylesReport, err := executeDetailedTool(ctx, runtime, "get_styles", nil, sessionID)
	if err != nil {
		return dsContextBundle{}, err
	}
	reports = append(reports, stylesReport)

	variables, variableReport, err := executeDetailedTool(ctx, runtime, "get_variable_defs", nil, sessionID)
	if err != nil {
		return dsContextBundle{}, err
	}
	reports = append(reports, variableReport)

	componentIDs := map[string]struct{}{}
	componentSetIDs := map[string]struct{}{}
	for _, node := range scannedNodes {
		switch node.Type {
		case "COMPONENT":
			componentIDs[node.ID] = struct{}{}
		case "COMPONENT_SET":
			componentSetIDs[node.ID] = struct{}{}
		}
	}

	relevantComponents := make([]dsLocalComponent, 0)
	for _, component := range localComponents {
		if _, ok := componentIDs[component.ID]; ok {
			relevantComponents = append(relevantComponents, component)
			continue
		}
		if component.ComponentSetID != "" {
			if _, ok := componentSetIDs[component.ComponentSetID]; ok {
				relevantComponents = append(relevantComponents, component)
			}
		}
	}
	sort.Slice(relevantComponents, func(i, j int) bool {
		return strings.ToLower(relevantComponents[i].Name) < strings.ToLower(relevantComponents[j].Name)
	})

	relevantSets := make([]dsComponentSet, 0)
	componentSetByID := map[string]dsComponentSet{}
	for _, set := range localSets {
		if _, ok := componentSetIDs[set.ID]; ok {
			relevantSets = append(relevantSets, set)
			componentSetByID[set.ID] = set
		}
	}
	sort.Slice(relevantSets, func(i, j int) bool {
		return strings.ToLower(relevantSets[i].Name) < strings.ToLower(relevantSets[j].Name)
	})

	semanticHints := make([]dsSemanticHint, 0, len(relevantComponents))
	hintByComponentID := map[string][]string{}
	for _, component := range relevantComponents {
		roles := inferDesignSystemRoles(component.Name, component.VariantProperties)
		hintByComponentID[component.ID] = roles
		semanticHints = append(semanticHints, dsSemanticHint{
			ComponentID: component.ID,
			Name:        component.Name,
			Roles:       roles,
		})
	}

	warnings := []string{}
	if len(relevantComponents) == 0 {
		warnings = append(warnings, "No components were found inside the selected design-system source subtree. DS apply may need to fallback.")
	}

	return dsContextBundle{
		SourceRoot:           rootNode,
		RelevantComponents:   relevantComponents,
		RelevantComponentSet: relevantSets,
		Styles:               styles,
		Variables:            variables,
		TextNodes:            textNodes,
		SemanticHints:        semanticHints,
		Warnings:             uniqueStrings(warnings),
		ExecutionReports:     reports,
		HintByComponentID:    hintByComponentID,
		ScannedNodes:         scannedNodes,
		ComponentSetByID:     componentSetByID,
	}, nil
}

func applyDesignSystemScreen(ctx context.Context, runtime *Runtime, args map[string]interface{}, sessionID string) (map[string]any, error) {
	intent := strings.TrimSpace(firstStringArg(args, "screenIntent", "recipe"))
	if intent == "" {
		intent = "screen"
	}
	intent = slugify(intent)

	targetParentID, err := resolveDesignSystemTargetParentID(args)
	if err != nil {
		return nil, err
	}

	var bundle dsContextBundle
	if rawContext, ok := args["sourceContext"]; ok {
		if err := decodeInto(rawContext, &bundle); err == nil && bundle.SourceRoot.ID != "" {
			if bundle.HintByComponentID == nil {
				bundle.HintByComponentID = map[string][]string{}
				for _, hint := range bundle.SemanticHints {
					bundle.HintByComponentID[hint.ComponentID] = hint.Roles
				}
			}
			if bundle.ComponentSetByID == nil {
				bundle.ComponentSetByID = map[string]dsComponentSet{}
				for _, set := range bundle.RelevantComponentSet {
					bundle.ComponentSetByID[set.ID] = set
				}
			}
		}
	}
	if bundle.SourceRoot.ID == "" {
		bundle, err = captureDesignSystemContext(ctx, runtime, args, sessionID)
		if err != nil {
			return nil, err
		}
	}

	rootFrame, reports, err := createDesignSystemScreenRoot(ctx, runtime, targetParentID, intent, sessionID)
	if err != nil {
		return nil, err
	}
	createdNodes := []map[string]any{rootFrame}
	instantiated := []map[string]any{}
	fallbacks := []map[string]any{}
	styleBoundCount := 0
	missingMappings := []string{}

	titleMatch := selectBestDesignComponent(bundle, dsRecipeSlot{
		Key:            "title",
		Label:          "Title",
		RequiredRoles:  []string{"title"},
		PreferredRoles: []string{"text"},
	})
	if titleMatch != nil {
		instance, report, instantiateErr := instantiateDesignComponent(ctx, runtime, titleMatch.Component.ID, rootFrame["id"].(string), sessionID)
		reports = append(reports, report)
		if instantiateErr == nil {
			instantiated = append(instantiated, map[string]any{"slot": "title", "instance": instance, "component": titleMatch.Component.Name})
		}
	}
	if titleMatch == nil {
		titleNode, report, titleErr := createStyledTitleFallback(ctx, runtime, rootFrame["id"].(string), intent, sessionID)
		reports = append(reports, report)
		if titleErr == nil {
			createdNodes = append(createdNodes, titleNode)
			styleBoundCount++
			fallbacks = append(fallbacks, map[string]any{"slot": "title", "kind": "style/text", "node": titleNode})
			missingMappings = append(missingMappings, "title")
		}
	}

	formStack, report, err := createDesignSystemFormStack(ctx, runtime, rootFrame["id"].(string), sessionID)
	if err != nil {
		return nil, err
	}
	reports = append(reports, report)
	createdNodes = append(createdNodes, formStack)

	slots := []dsRecipeSlot{
		{Key: "full_name", Label: "Full name input", RequiredRoles: []string{"input"}, PreferredRoles: []string{"name"}},
		{Key: "phone", Label: "Phone input", RequiredRoles: []string{"input"}, PreferredRoles: []string{"phone"}},
		{Key: "password", Label: "Password input", RequiredRoles: []string{"input"}, PreferredRoles: []string{"password"}},
		{Key: "primary_button", Label: "Primary button", RequiredRoles: []string{"button"}, PreferredRoles: []string{"primary"}},
	}
	for _, slot := range slots {
		match := selectBestDesignComponent(bundle, slot)
		if match != nil {
			instance, instanceReport, instantiateErr := instantiateDesignComponent(ctx, runtime, match.Component.ID, formStack["id"].(string), sessionID)
			reports = append(reports, instanceReport)
			if instantiateErr == nil {
				instantiated = append(instantiated, map[string]any{
					"slot":      slot.Key,
					"instance":  instance,
					"component": match.Component.Name,
					"roles":     match.Roles,
				})
				continue
			}
		}

		fallbackNode, fallbackReports, fallbackErr := createPrimitiveFallbackSlot(ctx, runtime, formStack["id"].(string), sessionID, slot)
		reports = append(reports, fallbackReports...)
		if fallbackErr == nil {
			createdNodes = append(createdNodes, fallbackNode)
			fallbacks = append(fallbacks, map[string]any{"slot": slot.Key, "kind": "primitive", "node": fallbackNode})
		}
		missingMappings = append(missingMappings, slot.Key)
	}

	helperMatch := selectBestDesignComponent(bundle, dsRecipeSlot{
		Key:            "helper",
		Label:          "Helper text",
		RequiredRoles:  []string{"helper"},
		PreferredRoles: []string{"text"},
	})
	if helperMatch != nil {
		instance, helperReport, helperErr := instantiateDesignComponent(ctx, runtime, helperMatch.Component.ID, rootFrame["id"].(string), sessionID)
		reports = append(reports, helperReport)
		if helperErr == nil {
			instantiated = append(instantiated, map[string]any{"slot": "helper", "instance": instance, "component": helperMatch.Component.Name})
		}
	} else {
		helperNode, helperReport, helperErr := createHelperTextFallback(ctx, runtime, rootFrame["id"].(string), intent, sessionID)
		reports = append(reports, helperReport)
		if helperErr == nil {
			createdNodes = append(createdNodes, helperNode)
			styleBoundCount++
			fallbacks = append(fallbacks, map[string]any{"slot": "helper", "kind": "style/text", "node": helperNode})
			missingMappings = append(missingMappings, "helper")
		}
	}

	auditResult, auditErr := auditDesignSystemAdoption(ctx, runtime, rootFrame["id"].(string), sessionID)
	adoptionSummary := dsAdoptionSummary{
		InstanceBasedCount:     len(instantiated),
		StyleBoundCount:        styleBoundCount,
		PrimitiveFallbackCount: len(fallbacks) - styleBoundCount,
		MissingMappings:        uniqueStrings(missingMappings),
	}
	if auditErr == nil {
		if auditSummary, ok := auditResult["summary"].(map[string]any); ok {
			if count, ok := auditSummary["instanceBasedCount"].(int); ok {
				adoptionSummary.InstanceBasedCount = count
			}
			if count, ok := auditSummary["styleBoundCount"].(int); ok {
				adoptionSummary.StyleBoundCount = count
			}
			if count, ok := auditSummary["primitiveFallbackCount"].(int); ok {
				adoptionSummary.PrimitiveFallbackCount = count
			}
		}
	}

	return map[string]any{
		"screenIntent":           intent,
		"sourceRoot":             bundle.SourceRoot,
		"targetRoot":             rootFrame,
		"nodesCreated":           createdNodes,
		"componentsInstantiated": instantiated,
		"fallbacksUsed":          fallbacks,
		"missingComponentMappings": uniqueStrings(missingMappings),
		"adoptionSummary":        adoptionSummary,
		"executionReports":       reports,
		"designSystemWarnings":   bundle.Warnings,
	}, nil
}

func auditDesignSystemAdoption(ctx context.Context, runtime *Runtime, rootNodeID string, sessionID string) (map[string]any, error) {
	params := map[string]interface{}{
		"detail":           "full",
		"depth":            6,
		"maxNodes":         1200,
		"maxTimeMs":        10000,
		"compactInstances": false,
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "get_node_context", []string{NormalizeNodeID(rootNodeID)}, params)
	if err != nil {
		return nil, err
	}
	if result.Response.Error != "" {
		return nil, errors.New(result.Response.Error)
	}

	root, decodeErr := decodeNode(result.Response.Data)
	if decodeErr != nil {
		return nil, fmt.Errorf("decode audit root: %w", decodeErr)
	}

	summary := summarizeDesignSystemAdoption(root)
	return map[string]any{
		"rootNodeId":       rootNodeID,
		"summary":          summary,
		"executionReport":  result.Report,
	}, nil
}

func resolveDesignSystemSourceRootID(args map[string]interface{}) (string, error) {
	if sourceRootID, ok := args["sourceRootNodeId"].(string); ok && sourceRootID != "" {
		return NormalizeNodeID(sourceRootID), nil
	}
	if sourcePageID, ok := args["sourcePageId"].(string); ok && sourcePageID != "" {
		return NormalizeNodeID(sourcePageID), nil
	}
	return "", fmt.Errorf("sourcePageId or sourceRootNodeId is required")
}

func resolveDesignSystemTargetParentID(args map[string]interface{}) (string, error) {
	if targetParentID, ok := args["targetParentId"].(string); ok && targetParentID != "" {
		return NormalizeNodeID(targetParentID), nil
	}
	if targetPageID, ok := args["targetPageId"].(string); ok && targetPageID != "" {
		return NormalizeNodeID(targetPageID), nil
	}
	return "", fmt.Errorf("targetPageId or targetParentId is required")
}

func fetchSmartNodeSummary(ctx context.Context, runtime *Runtime, nodeID, sessionID string) (smartSelectionNode, ExecutionReport, error) {
	params := map[string]interface{}{
		"detail":           "summary",
		"depth":            1,
		"maxNodes":         100,
		"maxTimeMs":        3000,
		"compactInstances": true,
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "get_node_context", []string{nodeID}, params)
	if err != nil {
		return smartSelectionNode{}, result.Report, err
	}
	if result.Response.Error != "" {
		return smartSelectionNode{}, result.Report, errors.New(result.Response.Error)
	}
	node, decodeErr := decodeNode(result.Response.Data)
	if decodeErr != nil {
		return smartSelectionNode{}, result.Report, decodeErr
	}
	return smartSelectionNode{ID: node.ID, Name: node.Name, Type: node.Type, Bounds: node.Bounds, Characters: node.Characters}, result.Report, nil
}

func fetchSourceDesignSystemNodes(ctx context.Context, runtime *Runtime, nodeID, sessionID string) ([]dsScannedNode, ExecutionReport, error) {
	params := map[string]interface{}{
		"nodeId":    nodeID,
		"types":     []interface{}{"COMPONENT", "COMPONENT_SET"},
		"maxVisited": 1500.0,
		"maxTimeMs":  9000.0,
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "scan_nodes_by_types", nil, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	var payload struct {
		MatchingNodes []dsScannedNode `json:"matchingNodes"`
	}
	if err := decodeInto(result.Response.Data, &payload); err != nil {
		return nil, result.Report, err
	}
	return payload.MatchingNodes, result.Report, nil
}

func fetchSourceTextNodes(ctx context.Context, runtime *Runtime, nodeID, sessionID string) ([]dsTextNode, ExecutionReport, error) {
	params := map[string]interface{}{
		"nodeId":     nodeID,
		"maxVisited": 1500.0,
		"maxTimeMs":  9000.0,
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "scan_text_nodes", nil, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	var payload struct {
		TextNodes []dsTextNode `json:"textNodes"`
	}
	if err := decodeInto(result.Response.Data, &payload); err != nil {
		return nil, result.Report, err
	}
	return payload.TextNodes, result.Report, nil
}

func fetchLocalDesignComponents(ctx context.Context, runtime *Runtime, sessionID string) ([]dsLocalComponent, []dsComponentSet, ExecutionReport, error) {
	params := map[string]interface{}{}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "get_local_components", nil, params)
	if err != nil {
		return nil, nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, nil, result.Report, errors.New(result.Response.Error)
	}
	var payload struct {
		Components    []dsLocalComponent `json:"components"`
		ComponentSets []dsComponentSet   `json:"componentSets"`
	}
	if err := decodeInto(result.Response.Data, &payload); err != nil {
		return nil, nil, result.Report, err
	}
	return payload.Components, payload.ComponentSets, result.Report, nil
}

func executeDetailedTool(ctx context.Context, runtime *Runtime, tool string, nodeIDs []string, sessionID string) (interface{}, ExecutionReport, error) {
	params := map[string]interface{}{}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, tool, nodeIDs, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	return result.Response.Data, result.Report, nil
}

func inferDesignSystemRoles(name string, variantProperties map[string]interface{}) []string {
	tokens := strings.ToLower(name)
	roleSet := map[string]struct{}{}
	addRoleByToken(roleSet, tokens, "button", "button", "cta")
	addRoleByToken(roleSet, tokens, "input", "input", "field", "text field", "textfield")
	addRoleByToken(roleSet, tokens, "phone", "phone", "mobile", "tel")
	addRoleByToken(roleSet, tokens, "password", "password", "passcode")
	addRoleByToken(roleSet, tokens, "name", "name", "full name", "fullname")
	addRoleByToken(roleSet, tokens, "title", "title", "heading", "header")
	addRoleByToken(roleSet, tokens, "text", "text", "label", "body")
	addRoleByToken(roleSet, tokens, "helper", "helper", "caption", "supporting")
	addRoleByToken(roleSet, tokens, "primary", "primary", "brand", "filled")
	for key, value := range variantProperties {
		token := strings.ToLower(key + " " + fmt.Sprint(value))
		addRoleByToken(roleSet, token, "button", "button", "cta")
		addRoleByToken(roleSet, token, "input", "input", "field", "text field", "textfield")
		addRoleByToken(roleSet, token, "phone", "phone", "mobile", "tel")
		addRoleByToken(roleSet, token, "password", "password", "passcode")
		addRoleByToken(roleSet, token, "name", "name", "full name", "fullname")
		addRoleByToken(roleSet, token, "title", "title", "heading", "header")
		addRoleByToken(roleSet, token, "helper", "helper", "caption", "supporting")
		addRoleByToken(roleSet, token, "primary", "primary", "brand", "filled")
	}
	roles := make([]string, 0, len(roleSet))
	for role := range roleSet {
		roles = append(roles, role)
	}
	sort.Strings(roles)
	return roles
}

func addRoleByToken(roles map[string]struct{}, haystack, role string, tokens ...string) {
	for _, token := range tokens {
		if strings.Contains(haystack, token) {
			roles[role] = struct{}{}
			return
		}
	}
}

func selectBestDesignComponent(bundle dsContextBundle, slot dsRecipeSlot) *dsComponentMatch {
	var best *dsComponentMatch
	for _, component := range bundle.RelevantComponents {
		roles := bundle.HintByComponentID[component.ID]
		if len(roles) == 0 {
			roles = inferDesignSystemRoles(component.Name, component.VariantProperties)
		}
		score := scoreDesignComponentMatch(roles, slot)
		if score <= 0 {
			continue
		}
		candidate := &dsComponentMatch{Component: component, Roles: roles, Score: score}
		if best == nil || candidate.Score > best.Score {
			best = candidate
		}
	}
	return best
}

func scoreDesignComponentMatch(roles []string, slot dsRecipeSlot) int {
	roleSet := map[string]struct{}{}
	for _, role := range roles {
		roleSet[role] = struct{}{}
	}
	score := 0
	for _, required := range slot.RequiredRoles {
		if _, ok := roleSet[required]; !ok {
			return 0
		}
		score += 100
	}
	for _, preferred := range slot.PreferredRoles {
		if _, ok := roleSet[preferred]; ok {
			score += 15
		}
	}
	return score
}

func createDesignSystemScreenRoot(ctx context.Context, runtime *Runtime, parentID, intent, sessionID string) (map[string]any, []ExecutionReport, error) {
	screenName := "DS Screen / " + intentToTitle(intent)
	params := map[string]interface{}{
		"name":                   screenName,
		"parentId":               parentID,
		"width":                  360.0,
		"height":                 480.0,
		"fillColor":              "#FFFFFF",
		"layoutMode":             "VERTICAL",
		"paddingTop":             24.0,
		"paddingRight":           24.0,
		"paddingBottom":          24.0,
		"paddingLeft":            24.0,
		"itemSpacing":            16.0,
		"counterAxisSizingMode":  "FIXED",
		"primaryAxisSizingMode":  "AUTO",
		"counterAxisAlignItems":  "MIN",
		"primaryAxisAlignItems":  "MIN",
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "create_frame", nil, params)
	if err != nil {
		return nil, []ExecutionReport{result.Report}, err
	}
	if result.Response.Error != "" {
		return nil, []ExecutionReport{result.Report}, errors.New(result.Response.Error)
	}
	var out map[string]any
	if err := decodeInto(result.Response.Data, &out); err != nil {
		return nil, []ExecutionReport{result.Report}, err
	}
	return out, []ExecutionReport{result.Report}, nil
}

func createDesignSystemFormStack(ctx context.Context, runtime *Runtime, parentID, sessionID string) (map[string]any, ExecutionReport, error) {
	params := map[string]interface{}{
		"name":                  "Form Stack",
		"parentId":              parentID,
		"width":                 312.0,
		"height":                260.0,
		"layoutMode":            "VERTICAL",
		"itemSpacing":           12.0,
		"counterAxisSizingMode": "FIXED",
		"primaryAxisSizingMode": "AUTO",
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "create_frame", nil, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	var out map[string]any
	if err := decodeInto(result.Response.Data, &out); err != nil {
		return nil, result.Report, err
	}
	return out, result.Report, nil
}

func instantiateDesignComponent(ctx context.Context, runtime *Runtime, componentID, parentID, sessionID string) (map[string]any, ExecutionReport, error) {
	params := map[string]interface{}{
		"componentId": componentID,
		"parentId":    parentID,
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "instantiate_component", nil, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	var out map[string]any
	if err := decodeInto(result.Response.Data, &out); err != nil {
		return nil, result.Report, err
	}
	return out, result.Report, nil
}

func createStyledTitleFallback(ctx context.Context, runtime *Runtime, parentID, intent, sessionID string) (map[string]any, ExecutionReport, error) {
	label := intentToTitle(intent)
	params := map[string]interface{}{
		"text":       label,
		"parentId":   parentID,
		"name":       "Title / " + label,
		"fontSize":   28.0,
		"fontFamily": "Inter",
		"fontStyle":  "Bold",
		"fillColor":  "#0F172A",
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "create_text", nil, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	var out map[string]any
	if err := decodeInto(result.Response.Data, &out); err != nil {
		return nil, result.Report, err
	}
	return out, result.Report, nil
}

func createHelperTextFallback(ctx context.Context, runtime *Runtime, parentID, intent, sessionID string) (map[string]any, ExecutionReport, error) {
	label := intentToTitle(intent)
	params := map[string]interface{}{
		"text":       label,
		"parentId":   parentID,
		"name":       "Helper / " + label,
		"fontSize":   14.0,
		"fontFamily": "Inter",
		"fontStyle":  "Regular",
		"fillColor":  "#475467",
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	result, err := runtime.Engine.ExecuteDetailed(ctx, "create_text", nil, params)
	if err != nil {
		return nil, result.Report, err
	}
	if result.Response.Error != "" {
		return nil, result.Report, errors.New(result.Response.Error)
	}
	var out map[string]any
	if err := decodeInto(result.Response.Data, &out); err != nil {
		return nil, result.Report, err
	}
	return out, result.Report, nil
}

func createPrimitiveFallbackSlot(ctx context.Context, runtime *Runtime, parentID, sessionID string, slot dsRecipeSlot) (map[string]any, []ExecutionReport, error) {
	frameParams := map[string]interface{}{
		"name":                  "Fallback / " + slot.Label,
		"parentId":              parentID,
		"width":                 312.0,
		"height":                52.0,
		"fillColor":             "#FFFFFF",
		"layoutMode":            "HORIZONTAL",
		"paddingTop":            14.0,
		"paddingRight":          16.0,
		"paddingBottom":         14.0,
		"paddingLeft":           16.0,
		"counterAxisSizingMode": "FIXED",
		"primaryAxisSizingMode": "FIXED",
	}
	if sessionID != "" {
		frameParams["sessionId"] = sessionID
	}
	frameResult, err := runtime.Engine.ExecuteDetailed(ctx, "create_frame", nil, frameParams)
	reports := []ExecutionReport{frameResult.Report}
	if err != nil {
		return nil, reports, err
	}
	if frameResult.Response.Error != "" {
		return nil, reports, errors.New(frameResult.Response.Error)
	}
	var frame map[string]any
	if err := decodeInto(frameResult.Response.Data, &frame); err != nil {
		return nil, reports, err
	}

	strokeParams := map[string]interface{}{
		"nodeId":       frame["id"],
		"color":        "#D0D5DD",
		"strokeWeight": 1.0,
	}
	if sessionID != "" {
		strokeParams["sessionId"] = sessionID
	}
	strokeResult, strokeErr := runtime.Engine.ExecuteDetailed(ctx, "set_strokes", []string{fmt.Sprint(frame["id"])}, strokeParams)
	reports = append(reports, strokeResult.Report)
	if strokeErr != nil {
		return nil, reports, strokeErr
	}
	if strokeResult.Response.Error != "" {
		return nil, reports, errors.New(strokeResult.Response.Error)
	}

	labelParams := map[string]interface{}{
		"text":       slot.Label,
		"parentId":   frame["id"],
		"name":       "Fallback Label / " + slot.Label,
		"fontSize":   14.0,
		"fontFamily": "Inter",
		"fontStyle":  "Regular",
		"fillColor":  "#344054",
	}
	if sessionID != "" {
		labelParams["sessionId"] = sessionID
	}
	labelResult, labelErr := runtime.Engine.ExecuteDetailed(ctx, "create_text", nil, labelParams)
	reports = append(reports, labelResult.Report)
	if labelErr != nil {
		return nil, reports, labelErr
	}
	if labelResult.Response.Error != "" {
		return nil, reports, errors.New(labelResult.Response.Error)
	}

	return frame, reports, nil
}

func summarizeDesignSystemAdoption(root zGenNode) dsAdoptionSummary {
	summary := dsAdoptionSummary{}
	var walk func(node zGenNode)
	walk = func(node zGenNode) {
		if node.Type == "INSTANCE" {
			summary.InstanceBasedCount++
		} else if len(node.Styles) > 0 {
			summary.StyleBoundCount++
		} else if shouldCountAsPrimitiveFallback(node) {
			summary.PrimitiveFallbackCount++
		}
		for _, child := range node.Children {
			walk(child)
		}
	}
	walk(root)
	return summary
}

func shouldCountAsPrimitiveFallback(node zGenNode) bool {
	switch node.Type {
	case "PAGE", "SECTION", "GROUP":
		return false
	case "FRAME":
		return len(node.Children) == 0
	case "RECTANGLE", "ELLIPSE", "LINE", "VECTOR", "TEXT", "POLYGON", "STAR", "BOOLEAN_OPERATION":
		return true
	default:
		return false
	}
}

func firstStringArg(args map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := args[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}
