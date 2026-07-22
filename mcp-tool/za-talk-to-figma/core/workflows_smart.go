package core

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type smartSelectionNode struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Type       string      `json:"type"`
	Bounds     *zGenBounds `json:"bounds,omitempty"`
	Characters string      `json:"characters,omitempty"`
}

type smartNodeInspection struct {
	Node   smartSelectionNode `json:"node"`
	Data   zGenNode           `json:"data"`
	Report ExecutionReport    `json:"report"`
}

func registerSmartTools(s *server.MCPServer, runtime *Runtime) {
	registerDesignSystemTools(s, runtime)

	s.AddTool(mcp.NewTool("inspect_selection_safely",
		mcp.WithDescription("Inspect the current selection using context-safe reads, fallback-aware execution, and structured reports. Prefer this over calling get_selection + get_node manually on large files."),
		mcp.WithString("detail", mcp.Description("Read verbosity for each selected node: summary, compact, or full (default compact)")),
		mcp.WithNumber("depth", mcp.Description("Maximum traversal depth per selected node (default 3)")),
		mcp.WithNumber("maxNodes", mcp.Description("Traversal node budget per selected node (default 1200)")),
		mcp.WithNumber("maxTimeMs", mcp.Description("Traversal time budget per selected node in milliseconds (default 8000)")),
		mcp.WithNumber("limit", mcp.Description("Maximum number of selected nodes to inspect (default 8)")),
		mcp.WithBoolean("compactInstances", mcp.Description("When true, nested INSTANCE subtrees are compacted instead of fully expanded")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeInspectSelectionSafely(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("review_canvas_layout",
		mcp.WithDescription("Read the real active canvas before concluding visual work. Returns a page summary, overlap diagnostics, and cleanup-oriented recommendations."),
		mcp.WithNumber("depth", mcp.Description("Depth for page context review (default 2)")),
		mcp.WithNumber("maxNodes", mcp.Description("Traversal node budget for page review (default 900)")),
		mcp.WithNumber("maxTimeMs", mcp.Description("Traversal time budget in milliseconds for page review (default 9000)")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeReviewCanvasLayout(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("cleanup_board_layout",
		mcp.WithDescription("Normalize the current selection into a clean vertical review stack so boards and frames do not overlap on canvas."),
		mcp.WithNumber("spacing", mcp.Description("Spacing between selected nodes after cleanup (default 64)")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeCleanupBoardLayout(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("prepare_export_bundle",
		mcp.WithDescription("Export a disciplined bundle of screenshots and optional PDF plus a manifest under generated/exports/bundles."),
		mcp.WithArray("nodeIds",
			mcp.Description("Optional node IDs to export. If omitted, uses the current selection."),
			mcp.WithStringItems(),
		),
		mcp.WithString("bundleName", mcp.Description("Optional export bundle name.")),
		mcp.WithString("imageFormat", mcp.Description("Default raster/vector format for screenshots: PNG, JPG, or SVG (default PNG).")),
		mcp.WithNumber("imageScale", mcp.Description("Default scale for raster screenshot exports (default 2).")),
		mcp.WithBoolean("includePdf", mcp.Description("When true, also exports a combined PDF for the node set.")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executePrepareExportBundle(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("safe_page_inventory",
		mcp.WithDescription("Read the current page using context-safe budgets and return a practical inventory of top-level structures, loose nodes, overlaps, and review recommendations."),
		mcp.WithNumber("depth", mcp.Description("Depth for page inventory (default 2)")),
		mcp.WithNumber("maxNodes", mcp.Description("Traversal node budget for page inventory (default 900)")),
		mcp.WithNumber("maxTimeMs", mcp.Description("Traversal time budget in milliseconds for page inventory (default 9000)")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeSafePageInventory(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("extract_component_candidates",
		mcp.WithDescription("Inspect a selection or subtree and suggest likely component families, repeated patterns, and extraction candidates without requiring a full deep page scan."),
		mcp.WithString("nodeId", mcp.Description("Optional root node to inspect. If omitted, uses the current selection.")),
		mcp.WithNumber("depth", mcp.Description("Traversal depth for inspection (default 4)")),
		mcp.WithNumber("maxNodes", mcp.Description("Traversal node budget (default 1500)")),
		mcp.WithNumber("maxTimeMs", mcp.Description("Traversal time budget in milliseconds (default 9000)")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeExtractComponentCandidates(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("normalize_review_board",
		mcp.WithDescription("Arrange selected review nodes into a clean vertical board, or if nothing is selected, normalize top-level page structures based on current canvas inventory."),
		mcp.WithNumber("spacing", mcp.Description("Spacing between arranged nodes after normalization (default 64)")),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeNormalizeReviewBoard(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("get_runtime_sessions",
		mcp.WithDescription("List live Figma runtime sessions currently connected to this runtime and identify the active session used for tool routing."),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeGetRuntimeSessions(ctx, runtime, req)
	})

	s.AddTool(mcp.NewTool("set_runtime_session",
		mcp.WithDescription("Set the active Figma runtime session used by subsequent tool calls when no explicit session target is provided."),
		mcp.WithString("sessionId", mcp.Required(), mcp.Description("The sessionId to promote as the active runtime session.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeSetRuntimeSession(ctx, runtime, req)
	})
}

func executeInspectSelectionSafely(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	baseParams := injectOptionalSession(nil, req)
	selectionResult, err := runtime.Engine.ExecuteDetailed(ctx, "get_selection", nil, baseParams)
	if err != nil {
		return renderResponse(selectionResult.Response, err)
	}
	if selectionResult.Response.Error != "" {
		return renderResponse(selectionResult.Response, nil)
	}

	var selection []smartSelectionNode
	if err := decodeInto(selectionResult.Response.Data, &selection); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode selection: %v", err)), nil
	}
	if len(selection) == 0 {
		return mcp.NewToolResultError("No selection found. Select one or more nodes first."), nil
	}

	limit := 8
	if rawLimit, ok := req.GetArguments()["limit"].(float64); ok && rawLimit > 0 {
		limit = int(rawLimit)
	}
	detail := "compact"
	if rawDetail, ok := req.GetArguments()["detail"].(string); ok && rawDetail != "" {
		detail = rawDetail
	}

	params := map[string]interface{}{
		"detail":           detail,
		"depth":            3,
		"maxNodes":         1200,
		"maxTimeMs":        8000,
		"compactInstances": true,
	}
	if depth, ok := req.GetArguments()["depth"].(float64); ok && depth > 0 {
		params["depth"] = depth
	}
	if maxNodes, ok := req.GetArguments()["maxNodes"].(float64); ok && maxNodes > 0 {
		params["maxNodes"] = maxNodes
	}
	if maxTimeMs, ok := req.GetArguments()["maxTimeMs"].(float64); ok && maxTimeMs > 0 {
		params["maxTimeMs"] = maxTimeMs
	}
	if compactInstances, ok := req.GetArguments()["compactInstances"].(bool); ok {
		params["compactInstances"] = compactInstances
	}
	params = injectOptionalSession(params, req)

	inspections := make([]smartNodeInspection, 0, minInt(limit, len(selection)))
	warnings := []string{}
	for index, node := range selection {
		if index >= limit {
			warnings = append(warnings, fmt.Sprintf("Selection has %d nodes; only the first %d were inspected.", len(selection), limit))
			break
		}
		result, inspectErr := runtime.Engine.ExecuteDetailed(ctx, "get_node_context", []string{node.ID}, params)
		if inspectErr != nil {
			warnings = append(warnings, fmt.Sprintf("Node %s (%s) failed to inspect: %v", node.ID, node.Name, inspectErr))
			continue
		}
		if result.Response.Error != "" {
			warnings = append(warnings, fmt.Sprintf("Node %s (%s) returned plugin error: %s", node.ID, node.Name, result.Response.Error))
			continue
		}
		decoded, decodeErr := decodeNode(result.Response.Data)
		if decodeErr != nil {
			warnings = append(warnings, fmt.Sprintf("Node %s (%s) decode failed: %v", node.ID, node.Name, decodeErr))
			continue
		}
		inspections = append(inspections, smartNodeInspection{
			Node:   node,
			Data:   decoded,
			Report: result.Report,
		})
	}

	payload := map[string]any{
		"selectionCount": len(selection),
		"selection":      selection,
		"inspections":    inspections,
		"reports":        []ExecutionReport{selectionResult.Report},
		"warnings":       uniqueStrings(warnings),
	}
	text, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal inspect_selection_safely: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeReviewCanvasLayout(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	baseParams := injectOptionalSession(nil, req)
	metaResult, err := runtime.Engine.ExecuteDetailed(ctx, "get_metadata", nil, baseParams)
	if err != nil {
		return renderResponse(metaResult.Response, err)
	}
	viewportResult, viewportErr := runtime.Engine.ExecuteDetailed(ctx, "get_viewport", nil, baseParams)
	if viewportErr != nil {
		return renderResponse(viewportResult.Response, viewportErr)
	}

	params := map[string]interface{}{
		"detail":           "compact",
		"depth":            2,
		"maxNodes":         900,
		"maxTimeMs":        9000,
		"compactInstances": true,
	}
	if depth, ok := req.GetArguments()["depth"].(float64); ok && depth > 0 {
		params["depth"] = depth
	}
	if maxNodes, ok := req.GetArguments()["maxNodes"].(float64); ok && maxNodes > 0 {
		params["maxNodes"] = maxNodes
	}
	if maxTimeMs, ok := req.GetArguments()["maxTimeMs"].(float64); ok && maxTimeMs > 0 {
		params["maxTimeMs"] = maxTimeMs
	}
	params = injectOptionalSession(params, req)

	contextResult, contextErr := runtime.Engine.ExecuteDetailed(ctx, "get_design_context", nil, params)
	if contextErr != nil {
		return renderResponse(contextResult.Response, contextErr)
	}
	if contextResult.Response.Error != "" {
		return renderResponse(contextResult.Response, nil)
	}

	var meta zGenMetadata
	if err := decodeInto(metaResult.Response.Data, &meta); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode metadata: %v", err)), nil
	}
	page, err := decodeNode(contextResult.Response.Data)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode design context: %v", err)), nil
	}

	recommendations := []string{}
	overlaps := []map[string]any{}
	if len(page.Children) > 1 {
		for i := 0; i < len(page.Children); i++ {
			for j := i + 1; j < len(page.Children); j++ {
				if nodesOverlap(page.Children[i], page.Children[j]) {
					overlaps = append(overlaps, map[string]any{
						"a": page.Children[i].Name,
						"b": page.Children[j].Name,
					})
				}
			}
		}
	}
	if len(overlaps) > 0 {
		recommendations = append(recommendations, "Top-level nodes overlap on canvas. Use cleanup_board_layout on the relevant selection before exporting or concluding visual work.")
	}

	strayNodes := []string{}
	for _, child := range page.Children {
		if child.Type != "SECTION" && child.Type != "FRAME" && child.Type != "GROUP" && child.Type != "COMPONENT" {
			strayNodes = append(strayNodes, child.Name)
		}
	}
	if len(strayNodes) > 0 {
		recommendations = append(recommendations, "Canvas has top-level stray nodes. Group or section them before declaring the board clean.")
	}

	payload := map[string]any{
		"fileName":         meta.FileName,
		"currentPageName":  meta.CurrentPageName,
		"pageContext":      page,
		"viewport":         viewportResult.Response.Data,
		"topLevelCount":    len(page.Children),
		"overlaps":         overlaps,
		"strayTopLevel":    strayNodes,
		"recommendations":  recommendations,
		"executionReports": []ExecutionReport{metaResult.Report, viewportResult.Report, contextResult.Report},
	}

	text, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal review_canvas_layout: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeCleanupBoardLayout(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	baseParams := injectOptionalSession(nil, req)
	selectionResult, err := runtime.Engine.ExecuteDetailed(ctx, "get_selection", nil, baseParams)
	if err != nil {
		return renderResponse(selectionResult.Response, err)
	}
	if selectionResult.Response.Error != "" {
		return renderResponse(selectionResult.Response, nil)
	}

	var selection []smartSelectionNode
	if err := decodeInto(selectionResult.Response.Data, &selection); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode selection: %v", err)), nil
	}
	if len(selection) < 2 {
		return mcp.NewToolResultError("cleanup_board_layout requires at least 2 selected nodes."), nil
	}

	spacing := 64.0
	if rawSpacing, ok := req.GetArguments()["spacing"].(float64); ok && rawSpacing > 0 {
		spacing = rawSpacing
	}

	sort.Slice(selection, func(i, j int) bool {
		yi, yj := 0.0, 0.0
		xi, xj := 0.0, 0.0
		if selection[i].Bounds != nil {
			yi = selection[i].Bounds.Y
			xi = selection[i].Bounds.X
		}
		if selection[j].Bounds != nil {
			yj = selection[j].Bounds.Y
			xj = selection[j].Bounds.X
		}
		if yi == yj {
			return xi < xj
		}
		return yi < yj
	})

	startX, startY := 0.0, 0.0
	foundBounds := false
	for _, node := range selection {
		if node.Bounds == nil {
			continue
		}
		if !foundBounds {
			startX = node.Bounds.X
			startY = node.Bounds.Y
			foundBounds = true
			continue
		}
		if node.Bounds.X < startX {
			startX = node.Bounds.X
		}
		if node.Bounds.Y < startY {
			startY = node.Bounds.Y
		}
	}
	if !foundBounds {
		return mcp.NewToolResultError("Selected nodes do not expose bounds, so cleanup_board_layout cannot reposition them safely."), nil
	}

	moveReports := make([]ExecutionReport, 0, len(selection)+1)
	moved := make([]map[string]any, 0, len(selection))
	cursorY := startY
	for _, node := range selection {
		height := 0.0
		if node.Bounds != nil {
			height = node.Bounds.Height
		}
		moveParams := map[string]interface{}{
			"x": startX,
			"y": cursorY,
		}
		moveParams = injectOptionalSession(moveParams, req)
		result, moveErr := runtime.Engine.ExecuteDetailed(ctx, "move_nodes", []string{node.ID}, moveParams)
		moveReports = append(moveReports, result.Report)
		if moveErr != nil {
			return mcp.NewToolResultError(moveErr.Error()), nil
		}
		if result.Response.Error != "" {
			return mcp.NewToolResultError(result.Response.Error), nil
		}
		moved = append(moved, map[string]any{
			"id":   node.ID,
			"name": node.Name,
			"x":    startX,
			"y":    cursorY,
		})
		cursorY += height + spacing
	}
	moveReports = append([]ExecutionReport{selectionResult.Report}, moveReports...)

	payload := map[string]any{
		"count":            len(moved),
		"spacing":          spacing,
		"startX":           startX,
		"startY":           startY,
		"moved":            moved,
		"executionReports": moveReports,
	}
	text, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal cleanup_board_layout: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executePrepareExportBundle(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	baseParams := injectOptionalSession(nil, req)
	workDir, err := os.Getwd()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("getwd: %v", err)), nil
	}

	nodeIDs := []string{}
	if raw, ok := req.GetArguments()["nodeIds"].([]interface{}); ok {
		nodeIDs = toStringSlice(raw)
	}
	reports := []ExecutionReport{}
	if len(nodeIDs) == 0 {
		selectionResult, selectionErr := runtime.Engine.ExecuteDetailed(ctx, "get_selection", nil, baseParams)
		if selectionErr != nil {
			return renderResponse(selectionResult.Response, selectionErr)
		}
		reports = append(reports, selectionResult.Report)
		var selection []smartSelectionNode
		if err := decodeInto(selectionResult.Response.Data, &selection); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("decode selection: %v", err)), nil
		}
		for _, node := range selection {
			nodeIDs = append(nodeIDs, node.ID)
		}
	}
	if len(nodeIDs) == 0 {
		return mcp.NewToolResultError("prepare_export_bundle needs nodeIds or a non-empty selection."), nil
	}

	pageContextParams := map[string]interface{}{
		"detail":           "compact",
		"depth":            2.0,
		"maxNodes":         900.0,
		"maxTimeMs":        9000.0,
		"compactInstances": true,
	}
	pageContextParams = injectOptionalSession(pageContextParams, req)
	pageContextResult, pageContextErr := runtime.Engine.ExecuteDetailed(ctx, "get_design_context", nil, pageContextParams)
	if pageContextErr == nil {
		reports = append(reports, pageContextResult.Report)
	}

	bundleName, _ := req.GetArguments()["bundleName"].(string)
	if bundleName == "" {
		bundleName = fmt.Sprintf("bundle-%s", time.Now().Format("20060102-150405"))
	}
	bundleSlug := slugify(bundleName)
	bundleDir, err := resolveOutputPath(filepath.Join("generated", "exports", "bundles", bundleSlug), workDir)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if err := os.MkdirAll(bundleDir, 0o755); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("mkdir bundle: %v", err)), nil
	}

	format := "PNG"
	if rawFormat, ok := req.GetArguments()["imageFormat"].(string); ok && rawFormat != "" {
		format = rawFormat
	}
	scale := 2.0
	if rawScale, ok := req.GetArguments()["imageScale"].(float64); ok && rawScale > 0 {
		scale = rawScale
	}

	items := make([]saveItem, 0, len(nodeIDs))
	for index, nodeID := range nodeIDs {
		ext := ".png"
		switch format {
		case "SVG":
			ext = ".svg"
		case "JPG":
			ext = ".jpg"
		}
		items = append(items, saveItem{
			NodeID:     nodeID,
			OutputPath: filepath.Join(bundleDir, fmt.Sprintf("%02d%s", index+1, ext)),
			Format:     format,
			Scale:      scale,
		})
	}

	results := make([]saveResult, 0, len(items))
	for index, item := range items {
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		result := saveScreenshotItem(ctx, runtime, item, index, workDir, format, scale, sessionID)
		results = append(results, result)
	}

	includePdf, _ := req.GetArguments()["includePdf"].(bool)
	pdfPath := ""
	if includePdf {
		pdfPath = filepath.Join(bundleDir, bundleSlug+".pdf")
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		if _, pdfErr := executeExportFramesToPDF(ctx, runtime, nodeIDs, pdfPath, sessionID); pdfErr != nil {
			return mcp.NewToolResultError(pdfErr.Error()), nil
		}
	}

	manifestPath := filepath.Join(bundleDir, "manifest.json")
	manifest := map[string]any{
		"bundleName":       bundleName,
		"bundleDir":        bundleDir,
		"nodeIds":          nodeIDs,
		"imageFormat":      format,
		"imageScale":       scale,
		"pdfPath":          pdfPath,
		"screenshots":      results,
		"executionReports": reports,
		"pageContext":      pageContextResult.Response.Data,
	}
	manifestBytes, marshalErr := json.MarshalIndent(manifest, "", "  ")
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal export manifest: %v", marshalErr)), nil
	}
	if err := os.WriteFile(manifestPath, manifestBytes, 0o644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("write export manifest: %v", err)), nil
	}

	text, marshalErr := json.Marshal(map[string]any{
		"bundleName":   bundleName,
		"bundleDir":    bundleDir,
		"manifestPath": manifestPath,
		"pdfPath":      pdfPath,
		"count":        len(results),
		"screenshots":  results,
	})
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal prepare_export_bundle: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeSafePageInventory(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	params := map[string]interface{}{
		"detail":           "compact",
		"depth":            2,
		"maxNodes":         900,
		"maxTimeMs":        9000,
		"compactInstances": true,
	}
	copyOptionalArg(params, req.GetArguments(), "depth", "maxNodes", "maxTimeMs")
	params = injectOptionalSession(params, req)

	contextResult, contextErr := runtime.Engine.ExecuteDetailed(ctx, "get_design_context", nil, params)
	if contextErr != nil {
		return renderResponse(contextResult.Response, contextErr)
	}
	page, decodeErr := decodeNode(contextResult.Response.Data)
	if decodeErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode page inventory: %v", decodeErr)), nil
	}

	topLevel := make([]map[string]any, 0, len(page.Children))
	looseNodes := []map[string]any{}
	overlaps := []map[string]any{}
	for _, child := range page.Children {
		topLevel = append(topLevel, map[string]any{
			"id":         child.ID,
			"name":       child.Name,
			"type":       child.Type,
			"childCount": len(child.Children),
			"bounds":     child.Bounds,
		})
		if child.Type != "FRAME" && child.Type != "SECTION" && child.Type != "COMPONENT" {
			looseNodes = append(looseNodes, map[string]any{
				"id":   child.ID,
				"name": child.Name,
				"type": child.Type,
			})
		}
	}
	for i := 0; i < len(page.Children); i++ {
		for j := i + 1; j < len(page.Children); j++ {
			if nodesOverlap(page.Children[i], page.Children[j]) {
				overlaps = append(overlaps, map[string]any{
					"a": page.Children[i].Name,
					"b": page.Children[j].Name,
				})
			}
		}
	}
	recommendations := []string{}
	if len(overlaps) > 0 {
		recommendations = append(recommendations, "Top-level nodes overlap. Run normalize_review_board or cleanup_board_layout before visual review.")
	}
	if len(looseNodes) > 0 {
		recommendations = append(recommendations, "Loose top-level nodes found. Consider grouping them into sections or moving them into a review board.")
	}
	if len(recommendations) == 0 {
		recommendations = append(recommendations, "Canvas top-level structure looks stable for review.")
	}

	payload := map[string]any{
		"page":            map[string]any{"id": page.ID, "name": page.Name, "type": page.Type},
		"topLevelCount":   len(topLevel),
		"topLevelNodes":   topLevel,
		"looseNodes":      looseNodes,
		"overlaps":        overlaps,
		"recommendations": recommendations,
		"executionReport": contextResult.Report,
	}
	text, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal safe_page_inventory: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeExtractComponentCandidates(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	nodeID, _ := req.GetArguments()["nodeId"].(string)
	params := map[string]interface{}{
		"detail":           "compact",
		"depth":            4,
		"maxNodes":         1500,
		"maxTimeMs":        9000,
		"compactInstances": true,
	}
	copyOptionalArg(params, req.GetArguments(), "depth", "maxNodes", "maxTimeMs")
	params = injectOptionalSession(params, req)

	type inspection struct {
		root   smartSelectionNode
		data   zGenNode
		report ExecutionReport
	}
	var inspections []inspection

	if nodeID != "" {
		nodeID = NormalizeNodeID(nodeID)
		result, err := runtime.Engine.ExecuteDetailed(ctx, "get_node_context", []string{nodeID}, params)
		if err != nil {
			return renderResponse(result.Response, err)
		}
		data, decodeErr := decodeNode(result.Response.Data)
		if decodeErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("decode node context: %v", decodeErr)), nil
		}
		inspections = append(inspections, inspection{root: smartSelectionNode{ID: nodeID, Name: data.Name, Type: data.Type, Bounds: data.Bounds}, data: data, report: result.Report})
	} else {
		selectionResult, err := runtime.Engine.ExecuteDetailed(ctx, "get_selection", nil, injectOptionalSession(nil, req))
		if err != nil {
			return renderResponse(selectionResult.Response, err)
		}
		var selection []smartSelectionNode
		if err := decodeInto(selectionResult.Response.Data, &selection); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("decode selection: %v", err)), nil
		}
		if len(selection) == 0 {
			return mcp.NewToolResultError("No selection found. Select one or more nodes first."), nil
		}
		for _, selected := range selection {
			result, resultErr := runtime.Engine.ExecuteDetailed(ctx, "get_node_context", []string{selected.ID}, params)
			if resultErr != nil {
				continue
			}
			data, decodeErr := decodeNode(result.Response.Data)
			if decodeErr != nil {
				continue
			}
			inspections = append(inspections, inspection{root: selected, data: data, report: result.Report})
		}
	}

	nameCounts := map[string]int{}
	typeCounts := map[string]int{}
	samples := map[string][]map[string]any{}
	var walk func(node zGenNode)
	walk = func(node zGenNode) {
		if node.Name != "" {
			nameCounts[node.Name]++
			if len(samples[node.Name]) < 3 {
				samples[node.Name] = append(samples[node.Name], map[string]any{"id": node.ID, "type": node.Type})
			}
		}
		if node.Type != "" {
			typeCounts[node.Type]++
		}
		for _, child := range node.Children {
			walk(child)
		}
	}
	reports := []ExecutionReport{}
	for _, item := range inspections {
		walk(item.data)
		reports = append(reports, item.report)
	}
	candidates := []map[string]any{}
	for name, count := range nameCounts {
		if count < 2 {
			continue
		}
		candidates = append(candidates, map[string]any{
			"name":    name,
			"count":   count,
			"samples": samples[name],
		})
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i]["count"].(int) > candidates[j]["count"].(int)
	})

	payload := map[string]any{
		"roots":      inspections,
		"typeCounts": typeCounts,
		"candidates": candidates,
		"recommendations": []string{
			"Promote repeated names into component families.",
			"Inspect sample nodes before converting to components if bounds or child structure differ.",
		},
		"executionReports": reports,
	}
	text, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal extract_component_candidates: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeNormalizeReviewBoard(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	baseParams := injectOptionalSession(nil, req)
	selectionResult, err := runtime.Engine.ExecuteDetailed(ctx, "get_selection", nil, baseParams)
	if err != nil {
		return renderResponse(selectionResult.Response, err)
	}
	var selection []smartSelectionNode
	if err := decodeInto(selectionResult.Response.Data, &selection); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode selection: %v", err)), nil
	}
	if len(selection) >= 2 {
		return executeCleanupBoardLayout(ctx, runtime, req)
	}

	contextParams := map[string]interface{}{
		"detail":           "compact",
		"depth":            1,
		"maxNodes":         400,
		"maxTimeMs":        5000,
		"compactInstances": true,
	}
	contextParams = injectOptionalSession(contextParams, req)
	contextResult, contextErr := runtime.Engine.ExecuteDetailed(ctx, "get_design_context", nil, contextParams)
	if contextErr != nil {
		return renderResponse(contextResult.Response, contextErr)
	}
	page, decodeErr := decodeNode(contextResult.Response.Data)
	if decodeErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("decode normalize board page: %v", decodeErr)), nil
	}
	if len(page.Children) < 2 {
		return mcp.NewToolResultError("normalize_review_board requires at least 2 top-level nodes when no selection is provided."), nil
	}
	spacing := 64.0
	if rawSpacing, ok := req.GetArguments()["spacing"].(float64); ok && rawSpacing > 0 {
		spacing = rawSpacing
	}
	sort.Slice(page.Children, func(i, j int) bool {
		yi, yj := 0.0, 0.0
		if page.Children[i].Bounds != nil {
			yi = page.Children[i].Bounds.Y
		}
		if page.Children[j].Bounds != nil {
			yj = page.Children[j].Bounds.Y
		}
		return yi < yj
	})
	startX, startY := 0.0, 0.0
	if page.Children[0].Bounds != nil {
		startX = page.Children[0].Bounds.X
		startY = page.Children[0].Bounds.Y
	}
	cursorY := startY
	moved := []map[string]any{}
	reports := []ExecutionReport{contextResult.Report}
	for _, child := range page.Children {
		height := 0.0
		if child.Bounds != nil {
			height = child.Bounds.Height
		}
		moveParams := injectOptionalSession(map[string]interface{}{"x": startX, "y": cursorY}, req)
		moveResult, moveErr := runtime.Engine.ExecuteDetailed(ctx, "move_nodes", []string{child.ID}, moveParams)
		reports = append(reports, moveResult.Report)
		if moveErr != nil {
			return mcp.NewToolResultError(moveErr.Error()), nil
		}
		moved = append(moved, map[string]any{"id": child.ID, "name": child.Name, "x": startX, "y": cursorY})
		cursorY += height + spacing
	}
	text, marshalErr := json.Marshal(map[string]any{
		"count":            len(moved),
		"spacing":          spacing,
		"moved":            moved,
		"executionReports": reports,
	})
	if marshalErr != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal normalize_review_board: %v", marshalErr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeGetRuntimeSessions(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	_ = ctx
	_ = req
	sessions := runtime.Node.SessionCatalog()
	payload := map[string]any{
		"activeSession": runtime.Node.ActiveSession(),
		"sessions":      sessions,
		"count":         len(sessions),
	}
	text, err := json.Marshal(payload)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal runtime sessions: %v", err)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func executeSetRuntimeSession(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	sessionID, _ := req.GetArguments()["sessionId"].(string)
	if sessionID == "" {
		return mcp.NewToolResultError("sessionId is required"), nil
	}
	if err := runtime.Node.SetActiveSession(ctx, sessionID); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	text, err := json.Marshal(map[string]any{
		"activeSession": sessionID,
		"ok":            true,
	})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal set_runtime_session: %v", err)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

func nodesOverlap(a, b zGenNode) bool {
	if a.Bounds == nil || b.Bounds == nil {
		return false
	}
	return a.Bounds.X < b.Bounds.X+b.Bounds.Width &&
		a.Bounds.X+a.Bounds.Width > b.Bounds.X &&
		a.Bounds.Y < b.Bounds.Y+b.Bounds.Height &&
		a.Bounds.Y+a.Bounds.Height > b.Bounds.Y
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
