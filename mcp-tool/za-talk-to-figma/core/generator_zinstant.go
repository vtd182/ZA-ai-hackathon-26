package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

type zGenMetadata struct {
	FileName        string `json:"fileName"`
	CurrentPageName string `json:"currentPageName"`
}

type zGenBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type zGenNode struct {
	ID                  string                 `json:"id"`
	Name                string                 `json:"name"`
	Type                string                 `json:"type"`
	Characters          string                 `json:"characters,omitempty"`
	MainComponentID     string                 `json:"mainComponentId,omitempty"`
	ComponentProperties map[string]interface{} `json:"componentProperties,omitempty"`
	Styles              map[string]interface{} `json:"styles,omitempty"`
	Bounds              *zGenBounds            `json:"bounds,omitempty"`
	Children            []zGenNode             `json:"children,omitempty"`
}

type zGenContext struct {
	Metadata        zGenMetadata      `json:"metadata"`
	Target          zGenNode          `json:"target"`
	ResolvedMode    ResolvedMode      `json:"resolvedMode"`
	OutputDir       string            `json:"outputDir"`
	StylesCount     int               `json:"stylesCount"`
	VariablesCount  int               `json:"variablesCount"`
	ComponentsCount int               `json:"componentsCount"`
	Warnings        []string          `json:"warnings"`
	TextBindings    map[string]string `json:"textBindings"`
	Files           map[string]string `json:"files"`
}

type zExtractResult struct {
	Metadata     zGenMetadata      `json:"metadata"`
	ScreenName   string            `json:"screenName"`
	Slug         string            `json:"slug"`
	Target       zGenNode          `json:"target"`
	TextBindings map[string]string `json:"textBindings"`
	Warnings     []string          `json:"warnings"`
	WorkDir      string            `json:"workDir"`
	TemplateRoot string            `json:"templateRoot,omitempty"`
}

type zEmitNode struct {
	ID                  string
	Name                string
	Type                string
	Tag                 string
	ClassName           string
	TextKey             string
	TextValue           string
	Width               float64
	Height              float64
	Radius              float64
	Spacing             float64
	Padding             zEmitPadding
	Direction           string
	BgColor             string
	TextColor           string
	StrokeColor         string
	Children            []*zEmitNode
	FontSize            float64
	FontFamily          string
	FontWeight          string
	LineHeightValue     float64
	LineHeightUnit      string
	LetterSpacingValue  float64
	LetterSpacingUnit   string
	TextAlignHorizontal string
}

type zEmitPadding struct {
	Top    float64
	Right  float64
	Bottom float64
	Left   float64
}

type zCountWrapper struct {
	Items []json.RawMessage `json:"data"`
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func detectTemplateRoot(workDir string) string {
	if _, err := os.Stat(filepath.Join(workDir, "zinstantconfig.json")); err == nil {
		return workDir
	}
	return ""
}

func executeGenerateZinstant(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	workDir, err := os.Getwd()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("getwd: %v", err)), nil
	}

	cfg, err := loadServerConfig(workDir)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	modeArg, _ := req.GetArguments()["mode"].(string)
	promptModeArg, _ := req.GetArguments()["promptMode"].(string)
	resolvedMode, err := resolveMode(cfg, modeArg, promptModeArg, ModeGenZinstant)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if resolvedMode.Mode != ModeGenZinstant {
		return mcp.NewToolResultError(fmt.Sprintf("generate_zinstant currently supports only mode %q, resolved mode was %q", ModeGenZinstant, resolvedMode.Mode)), nil
	}

	sessionID, _ := req.GetArguments()["sessionId"].(string)
	_, targetNode, warnings, err := resolveGeneratorTarget(ctx, runtime, req.GetArguments(), sessionID)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	meta, err := fetchMetadata(ctx, runtime, sessionID)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	screenName, _ := req.GetArguments()["screenName"].(string)
	if screenName == "" {
		screenName = firstNonEmpty(targetNode.Name, meta.CurrentPageName, "screen")
	}
	slug := slugify(screenName)

	_, textBindings, emitWarnings := buildZEmitTree(targetNode)
	warnings = append(warnings, emitWarnings...)

	extractOnly, _ := req.GetArguments()["extractOnly"].(bool)
	if extractOnly {
		result := zExtractResult{
			Metadata:     meta,
			ScreenName:   screenName,
			Slug:         slug,
			Target:       targetNode,
			TextBindings: textBindings,
			Warnings:     uniqueStrings(warnings),
			WorkDir:      workDir,
			TemplateRoot: detectTemplateRoot(workDir),
		}
		out, err := json.Marshal(result)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal result: %v", err)), nil
		}
		return mcp.NewToolResultText(string(out)), nil
	}

	outputDirArg, _ := req.GetArguments()["outputDir"].(string)
	if outputDirArg == "" {
		if tmplRoot := detectTemplateRoot(workDir); tmplRoot != "" {
			outputDirArg = tmplRoot
		} else {
			outputDirArg = filepath.Join(cfg.GeneratedRoot, "zinstant", slug)
		}
	}
	resolvedOutputDir, err := resolveOutputPath(outputDirArg, workDir)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	stylesCount, variablesCount, componentsCount := fetchInventoryCounts(ctx, runtime, sessionID)
	rootEmit, _, _ := buildZEmitTree(targetNode)

	files := buildZinstantFiles(slug, rootEmit, textBindings, screenName)
	if err := writeGeneratedFiles(resolvedOutputDir, files); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	result := zGenContext{
		Metadata: meta,
		Target: zGenNode{
			ID:         targetNode.ID,
			Name:       targetNode.Name,
			Type:       targetNode.Type,
			Bounds:     targetNode.Bounds,
			Characters: targetNode.Characters,
		},
		ResolvedMode:    resolvedMode,
		OutputDir:       resolvedOutputDir,
		StylesCount:     stylesCount,
		VariablesCount:  variablesCount,
		ComponentsCount: componentsCount,
		Warnings:        uniqueStrings(warnings),
		TextBindings:    textBindings,
		Files:           fileManifest(resolvedOutputDir, files),
	}

	out, err := json.Marshal(result)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal result: %v", err)), nil
	}
	return mcp.NewToolResultText(string(out)), nil
}

func resolveGeneratorTarget(ctx context.Context, runtime *Runtime, args map[string]interface{}, sessionID string) (string, zGenNode, []string, error) {
	if nodeID, _ := args["nodeId"].(string); nodeID != "" {
		target, err := fetchNodeByID(ctx, runtime, nodeID, sessionID)
		return nodeID, target, nil, err
	}

	selection, err := fetchSelection(ctx, runtime, sessionID)
	if err != nil {
		return "", zGenNode{}, nil, err
	}
	if len(selection) > 0 {
		target, err := fetchNodeByID(ctx, runtime, selection[0].ID, sessionID)
		return selection[0].ID, target, []string{"No nodeId supplied; used the first selected node."}, err
	}

	page, err := fetchCurrentPage(ctx, runtime, sessionID)
	if err != nil {
		return "", zGenNode{}, nil, err
	}
	return page.ID, page, []string{"No nodeId or selection found; used the current page."}, nil
}

func fetchNodeByID(ctx context.Context, runtime *Runtime, nodeID string, sessionID string) (zGenNode, error) {
	params := map[string]interface{}{
		"detail":           "full",
		"depth":            4,
		"maxNodes":         1600,
		"maxTimeMs":        12000,
		"compactInstances": true,
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	resp, err := runtime.Engine.Execute(ctx, "get_node_context", []string{nodeID}, params)
	if err != nil {
		return zGenNode{}, err
	}
	if resp.Error != "" {
		return zGenNode{}, errors.New(resp.Error)
	}
	return decodeNode(resp.Data)
}

func fetchSelection(ctx context.Context, runtime *Runtime, sessionID string) ([]zGenNode, error) {
	var params map[string]interface{}
	if sessionID != "" {
		params = map[string]interface{}{"sessionId": sessionID}
	}
	resp, err := runtime.Engine.Execute(ctx, "get_selection", nil, params)
	if err != nil {
		return nil, err
	}
	if resp.Error != "" {
		return nil, errors.New(resp.Error)
	}
	var out []zGenNode
	if err := decodeInto(resp.Data, &out); err != nil {
		return nil, fmt.Errorf("decode selection: %w", err)
	}
	return out, nil
}

func fetchCurrentPage(ctx context.Context, runtime *Runtime, sessionID string) (zGenNode, error) {
	var params map[string]interface{}
	if sessionID != "" {
		params = map[string]interface{}{"sessionId": sessionID}
	}
	resp, err := runtime.Engine.Execute(ctx, "get_document", nil, params)
	if err != nil {
		return zGenNode{}, err
	}
	if resp.Error != "" {
		return zGenNode{}, errors.New(resp.Error)
	}
	return decodeNode(resp.Data)
}

func fetchMetadata(ctx context.Context, runtime *Runtime, sessionID string) (zGenMetadata, error) {
	var params map[string]interface{}
	if sessionID != "" {
		params = map[string]interface{}{"sessionId": sessionID}
	}
	resp, err := runtime.Engine.Execute(ctx, "get_metadata", nil, params)
	if err != nil {
		return zGenMetadata{}, err
	}
	if resp.Error != "" {
		return zGenMetadata{}, errors.New(resp.Error)
	}
	var raw struct {
		FileName        string `json:"fileName"`
		CurrentPageName string `json:"currentPageName"`
	}
	if err := decodeInto(resp.Data, &raw); err != nil {
		return zGenMetadata{}, fmt.Errorf("decode metadata: %w", err)
	}
	return zGenMetadata(raw), nil
}

func fetchInventoryCounts(ctx context.Context, runtime *Runtime, sessionID string) (int, int, int) {
	stylesCount := countDataItems(ctx, runtime, "get_styles", sessionID)
	variablesCount := countVariableItems(ctx, runtime, sessionID)
	componentsCount := countDataItems(ctx, runtime, "get_local_components", sessionID)
	return stylesCount, variablesCount, componentsCount
}

func countDataItems(ctx context.Context, runtime *Runtime, tool string, sessionID string) int {
	var params map[string]interface{}
	if sessionID != "" {
		params = map[string]interface{}{"sessionId": sessionID}
	}
	resp, err := runtime.Engine.Execute(ctx, tool, nil, params)
	if err != nil || resp.Error != "" {
		return 0
	}

	var slice []json.RawMessage
	if err := decodeInto(resp.Data, &slice); err == nil {
		return len(slice)
	}

	var wrapped zCountWrapper
	if err := decodeInto(resp.Data, &wrapped); err == nil {
		return len(wrapped.Items)
	}
	return 0
}

func countVariableItems(ctx context.Context, runtime *Runtime, sessionID string) int {
	var params map[string]interface{}
	if sessionID != "" {
		params = map[string]interface{}{"sessionId": sessionID}
	}
	resp, err := runtime.Engine.Execute(ctx, "get_variable_defs", nil, params)
	if err != nil || resp.Error != "" {
		return 0
	}
	var wrapped struct {
		Collections []struct {
			Variables []json.RawMessage `json:"variables"`
		} `json:"collections"`
	}
	if err := decodeInto(resp.Data, &wrapped); err != nil {
		return 0
	}
	total := 0
	for _, coll := range wrapped.Collections {
		total += len(coll.Variables)
	}
	return total
}

func decodeNode(data interface{}) (zGenNode, error) {
	var out zGenNode
	if err := decodeInto(data, &out); err != nil {
		return zGenNode{}, err
	}
	return out, nil
}

func decodeInto(data interface{}, out interface{}) error {
	bytes, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return json.Unmarshal(bytes, out)
}

func buildZEmitTree(root zGenNode) (*zEmitNode, map[string]string, []string) {
	bindings := map[string]string{}
	warnings := []string{}
	counter := map[string]int{}
	return buildEmitNode(root, slugify(firstNonEmpty(root.Name, root.Type, "screen")), bindings, warnings, counter), bindings, warnings
}

func buildEmitNode(node zGenNode, prefix string, bindings map[string]string, warnings []string, counter map[string]int) *zEmitNode {
	base := slugify(firstNonEmpty(node.Name, node.Type, "node"))
	counterKey := prefix + "-" + base
	counter[counterKey]++
	className := counterKey
	if counter[counterKey] > 1 {
		className = fmt.Sprintf("%s-%d", counterKey, counter[counterKey])
	}

	out := &zEmitNode{
		ID:        node.ID,
		Name:      node.Name,
		Type:      node.Type,
		ClassName: className,
		Tag:       mapNodeTag(node.Type),
	}

	if node.Bounds != nil {
		out.Width = node.Bounds.Width
		out.Height = node.Bounds.Height
	}
	out.Direction = inferDirection(node.Children)
	out.Spacing = inferSpacing(node.Children, out.Direction)
	out.Padding = inferPadding(node.Bounds, node.Children)

	if node.Styles != nil {
		out.Radius = extractRadius(node.Styles["cornerRadius"])
		out.BgColor = extractPrimaryColor(node.Styles["fills"])
		out.StrokeColor = extractPrimaryColor(node.Styles["strokes"])

		if node.Type == "TEXT" {
			if fs, ok := node.Styles["fontSize"].(float64); ok {
				out.FontSize = fs
			}
			if ff, ok := node.Styles["fontFamily"].(string); ok {
				out.FontFamily = ff
			}
			if fw, ok := node.Styles["fontWeight"].(float64); ok {
				out.FontWeight = fmt.Sprintf("%.0f", fw)
			} else if fwStr, ok := node.Styles["fontWeight"].(string); ok {
				out.FontWeight = fwStr
			}

			if lh, ok := node.Styles["lineHeight"].(map[string]interface{}); ok {
				if lhVal, ok := lh["value"].(float64); ok {
					out.LineHeightValue = lhVal
				}
				if lhUnit, ok := lh["unit"].(string); ok {
					out.LineHeightUnit = lhUnit
				}
			}

			if ls, ok := node.Styles["letterSpacing"].(map[string]interface{}); ok {
				if lsVal, ok := ls["value"].(float64); ok {
					out.LetterSpacingValue = lsVal
				}
				if lsUnit, ok := ls["unit"].(string); ok {
					out.LetterSpacingUnit = lsUnit
				}
			}

			if tah, ok := node.Styles["textAlignHorizontal"].(string); ok {
				out.TextAlignHorizontal = tah
			}
		}
	}

	if node.Type == "TEXT" {
		out.TextColor = out.BgColor
		out.BgColor = ""
		keyBase := slugify(firstNonEmpty(node.Name, "text"))
		counter[keyBase]++
		out.TextKey = keyBase
		if counter[keyBase] > 1 {
			out.TextKey = fmt.Sprintf("%s_%d", keyBase, counter[keyBase])
		}
		out.TextValue = node.Characters
		bindings[out.TextKey] = node.Characters
	}

	for _, child := range node.Children {
		out.Children = append(out.Children, buildEmitNode(child, className, bindings, warnings, counter))
	}

	return out
}

func mapNodeTag(nodeType string) string {
	switch nodeType {
	case "TEXT":
		return "p"
	default:
		return "div"
	}
}

func inferDirection(children []zGenNode) string {
	if len(children) < 2 {
		return ""
	}

	minX, maxX := childAxisSpan(children, true)
	minY, maxY := childAxisSpan(children, false)
	if (maxX - minX) > (maxY - minY) {
		return "row"
	}
	return "column"
}

func childAxisSpan(children []zGenNode, horizontal bool) (float64, float64) {
	minVal, maxVal := 0.0, 0.0
	initialized := false
	for _, child := range children {
		if child.Bounds == nil {
			continue
		}
		v := child.Bounds.Y
		if horizontal {
			v = child.Bounds.X
		}
		if !initialized {
			minVal, maxVal = v, v
			initialized = true
			continue
		}
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
	}
	return minVal, maxVal
}

func inferSpacing(children []zGenNode, direction string) float64 {
	if len(children) < 2 || direction == "" {
		return 0
	}

	type interval struct {
		start float64
		end   float64
	}
	list := make([]interval, 0, len(children))
	for _, child := range children {
		if child.Bounds == nil {
			continue
		}
		if direction == "row" {
			list = append(list, interval{start: child.Bounds.X, end: child.Bounds.X + child.Bounds.Width})
		} else {
			list = append(list, interval{start: child.Bounds.Y, end: child.Bounds.Y + child.Bounds.Height})
		}
	}
	if len(list) < 2 {
		return 0
	}
	sort.Slice(list, func(i, j int) bool { return list[i].start < list[j].start })
	total := 0.0
	count := 0.0
	for i := 1; i < len(list); i++ {
		gap := list[i].start - list[i-1].end
		if gap > 0 {
			total += gap
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return total / count
}

func inferPadding(bounds *zGenBounds, children []zGenNode) zEmitPadding {
	if bounds == nil || len(children) == 0 {
		return zEmitPadding{}
	}

	minX, minY := bounds.Width, bounds.Height
	maxX, maxY := 0.0, 0.0
	found := false
	for _, child := range children {
		if child.Bounds == nil {
			continue
		}
		found = true
		if child.Bounds.X < minX {
			minX = child.Bounds.X
		}
		if child.Bounds.Y < minY {
			minY = child.Bounds.Y
		}
		if child.Bounds.X+child.Bounds.Width > maxX {
			maxX = child.Bounds.X + child.Bounds.Width
		}
		if child.Bounds.Y+child.Bounds.Height > maxY {
			maxY = child.Bounds.Y + child.Bounds.Height
		}
	}
	if !found {
		return zEmitPadding{}
	}

	left := clampNonNegative(minX - bounds.X)
	top := clampNonNegative(minY - bounds.Y)
	right := clampNonNegative((bounds.X + bounds.Width) - maxX)
	bottom := clampNonNegative((bounds.Y + bounds.Height) - maxY)
	return zEmitPadding{Top: top, Right: right, Bottom: bottom, Left: left}
}

func clampNonNegative(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

func extractRadius(raw interface{}) float64 {
	switch v := raw.(type) {
	case float64:
		return v
	default:
		return 0
	}
}

func extractPrimaryColor(raw any) string {
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return ""
	}
	first := items[0]
	// New format: { "type": "SOLID", "color": "#rrggbb" }
	if m, ok := first.(map[string]any); ok {
		if c, ok := m["color"].(string); ok && strings.HasPrefix(c, "#") {
			return c
		}
	}
	// Legacy format: plain hex string
	if s, ok := first.(string); ok && strings.HasPrefix(s, "#") {
		return s
	}
	return ""
}

// zinstantSkipIfExists lists files that are written only on first creation.
// Re-running generate_zinstant will not overwrite them.
var zinstantSkipIfExists = map[string]bool{
	"package.json":  true,
	"tsconfig.json": true,
	"src/index.ts":  true,
}

// zinstantConfigSyncKeys are the only keys updated when zinstantconfig.json already exists.
// All other keys (e.g. templateKey) are preserved from the existing file.
var zinstantConfigSyncKeys = []string{"zhtmlFile", "bundleDataFile", "version"}

func buildZinstantFiles(slug string, root *zEmitNode, bindings map[string]string, screenName string) map[string]string {
	return map[string]string{
		"package.json":                   buildZinstantPackageJSON(slug),
		"tsconfig.json":                  buildZinstantTSConfig(),
		"zinstantconfig.json":            buildZinstantConfig(),
		"config/bundle.json":             mustJSON(bindings),
		"zhtml/index.zhtml":              buildZhtml(root),
		"src/index.ts":                   buildZinstantIndexTS(),
		"za-talk-to-figma.manifest.json": buildManifestJSON(slug, root, bindings),
	}
}

func buildZinstantPackageJSON(slug string) string {
	return fmt.Sprintf("{\n  \"name\": %s,\n  \"private\": true,\n  \"dependencies\": {\n    \"@zinstant/types\": \"latest\"\n  }\n}\n", jsonString("zinstant-"+slug))
}

func buildZinstantTSConfig() string {
	return "{\n  \"compilerOptions\": {\n    \"target\": \"ES2020\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"Node\",\n    \"strict\": false,\n    \"types\": [\"@zinstant/types\"]\n  },\n  \"include\": [\"src/**/*\"]\n}\n"
}

func buildZinstantConfig() string {
	return "{\n  \"zhtmlFile\": \"zhtml/index.zhtml\",\n  \"bundleDataFile\": \"config/bundle.json\",\n  \"uiComponent\": \"zhtml/ui-component\",\n  \"outputDir\": \"dist\",\n  \"version\": 2,\n  \"templateKey\": \"\"\n}\n"
}

func buildZinstantIndexTS() string {
	return "document.ready(() => {\n  // Generated scaffold. Add behavior here when the screen needs runtime logic.\n});\n"
}

func buildManifestJSON(slug string, root *zEmitNode, bindings map[string]string) string {
	type manifest struct {
		Generator    string            `json:"generator"`
		Target       string            `json:"target"`
		TextBindings map[string]string `json:"textBindings"`
	}
	return mustJSON(manifest{
		Generator:    "generate_zinstant",
		Target:       slug,
		TextBindings: bindings,
	})
}

func buildZhtml(root *zEmitNode) string {
	var css strings.Builder
	var body strings.Builder
	css.WriteString(":root { }\n")
	emitCSS(root, &css)
	css.WriteString("\n@media (prefers-color-scheme: dark) {\n")
	emitDarkCSS(root, &css)
	css.WriteString("}\n")
	emitHTML(root, &body, 2)

	return fmt.Sprintf("<html>\n<head>\n  <style>\n%s  </style>\n</head>\n<body>\n%s</body>\n</html>\n", indentLines(css.String(), 4), body.String())
}

func emitHTML(node *zEmitNode, body *strings.Builder, depth int) {
	indent := strings.Repeat(" ", depth)
	if node.Tag == "p" {
		body.WriteString(fmt.Sprintf("%s<p id=%s class=%s>{{%s}}</p>\n", indent, htmlQuote(node.ID), htmlQuote(node.ClassName), node.TextKey))
		return
	}

	body.WriteString(fmt.Sprintf("%s<div id=%s class=%s>\n", indent, htmlQuote(node.ID), htmlQuote(node.ClassName)))
	for _, child := range node.Children {
		emitHTML(child, body, depth+2)
	}
	body.WriteString(fmt.Sprintf("%s</div>\n", indent))
}

func emitCSS(node *zEmitNode, css *strings.Builder) {
	css.WriteString(fmt.Sprintf(".%s {\n", node.ClassName))
	if node.Width > 0 {
		css.WriteString(fmt.Sprintf("  width: %.0fpx;\n", node.Width))
	}
	if node.Height > 0 {
		css.WriteString(fmt.Sprintf("  height: %.0fpx;\n", node.Height))
	}
	if len(node.Children) > 0 {
		css.WriteString("  display: flex;\n")
		if node.Direction != "" {
			css.WriteString(fmt.Sprintf("  flex-direction: %s;\n", node.Direction))
		} else {
			css.WriteString("  flex-direction: column;\n")
		}
	}
	if node.Spacing > 0 {
		css.WriteString(fmt.Sprintf("  gap: %.0fpx;\n", node.Spacing))
	}
	if node.Padding.Top > 0 || node.Padding.Right > 0 || node.Padding.Bottom > 0 || node.Padding.Left > 0 {
		css.WriteString(fmt.Sprintf("  padding: %.0fpx %.0fpx %.0fpx %.0fpx;\n", node.Padding.Top, node.Padding.Right, node.Padding.Bottom, node.Padding.Left))
	}
	if node.Radius > 0 {
		css.WriteString(fmt.Sprintf("  border-radius: %.0fpx;\n", node.Radius))
	}
	if node.BgColor != "" {
		css.WriteString(fmt.Sprintf("  background-color: %s;\n", node.BgColor))
	}
	if node.TextColor != "" {
		css.WriteString(fmt.Sprintf("  color: %s;\n", node.TextColor))
	}
	if node.StrokeColor != "" {
		css.WriteString(fmt.Sprintf("  border: 1px solid %s;\n", node.StrokeColor))
	}
	if node.Type == "TEXT" {
		if node.FontFamily != "" {
			css.WriteString(fmt.Sprintf("  font-family: %q, sans-serif;\n", node.FontFamily))
		}
		if node.FontSize > 0 {
			css.WriteString(fmt.Sprintf("  font-size: %.0fpx;\n", node.FontSize))
		}
		if node.FontWeight != "" {
			css.WriteString(fmt.Sprintf("  font-weight: %s;\n", node.FontWeight))
		}
		if node.LineHeightValue > 0 {
			if node.LineHeightUnit == "PIXELS" {
				css.WriteString(fmt.Sprintf("  line-height: %.2fpx;\n", node.LineHeightValue))
			} else if node.LineHeightUnit == "PERCENT" {
				css.WriteString(fmt.Sprintf("  line-height: %.2f%%;\n", node.LineHeightValue))
			} else {
				css.WriteString(fmt.Sprintf("  line-height: %.2f;\n", node.LineHeightValue))
			}
		}
		if node.LetterSpacingValue != 0 {
			if node.LetterSpacingUnit == "PIXELS" {
				css.WriteString(fmt.Sprintf("  letter-spacing: %.2fpx;\n", node.LetterSpacingValue))
			} else if node.LetterSpacingUnit == "PERCENT" {
				css.WriteString(fmt.Sprintf("  letter-spacing: %.2fem;\n", node.LetterSpacingValue/100.0))
			} else {
				css.WriteString(fmt.Sprintf("  letter-spacing: %.2fpx;\n", node.LetterSpacingValue))
			}
		}
		if node.TextAlignHorizontal != "" {
			align := strings.ToLower(node.TextAlignHorizontal)
			if align == "justified" {
				align = "justify"
			}
			css.WriteString(fmt.Sprintf("  text-align: %s;\n", align))
		}
	}
	css.WriteString("}\n")
	for _, child := range node.Children {
		emitCSS(child, css)
	}
}

func emitDarkCSS(node *zEmitNode, css *strings.Builder) {
	if node.BgColor != "" || node.TextColor != "" || node.StrokeColor != "" {
		css.WriteString(fmt.Sprintf("  .%s {\n", node.ClassName))
		if node.BgColor != "" {
			css.WriteString(fmt.Sprintf("    background-color: %s;\n", node.BgColor))
		}
		if node.TextColor != "" {
			css.WriteString(fmt.Sprintf("    color: %s;\n", node.TextColor))
		}
		if node.StrokeColor != "" {
			css.WriteString(fmt.Sprintf("    border-color: %s;\n", node.StrokeColor))
		}
		css.WriteString("  }\n")
	}
	for _, child := range node.Children {
		emitDarkCSS(child, css)
	}
}

func fileManifest(outputDir string, files map[string]string) map[string]string {
	result := make(map[string]string, len(files))
	for rel := range files {
		result[rel] = filepath.Join(outputDir, rel)
	}
	return result
}

func writeGeneratedFiles(outputDir string, files map[string]string) error {
	for rel, content := range files {
		fullPath := filepath.Join(outputDir, rel)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", filepath.Dir(fullPath), err)
		}

		// Some files are only written on first creation; never overwritten.
		if zinstantSkipIfExists[rel] {
			if _, err := os.Stat(fullPath); err == nil {
				continue
			}
		}

		// zinstantconfig.json: preserve existing keys, patch only sync keys.
		if rel == "zinstantconfig.json" {
			content = mergeZinstantConfig(fullPath, content)
		}

		if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// mergeZinstantConfig reads an existing zinstantconfig.json and updates only
// zinstantConfigSyncKeys from the generated content, preserving everything else
// (notably templateKey). Returns generated verbatim when no existing file is found.
func mergeZinstantConfig(path, generated string) string {
	existing, err := os.ReadFile(path)
	if err != nil {
		return generated
	}
	var existingMap map[string]interface{}
	if err := json.Unmarshal(existing, &existingMap); err != nil {
		return generated
	}
	var generatedMap map[string]interface{}
	if err := json.Unmarshal([]byte(generated), &generatedMap); err != nil {
		return string(existing)
	}
	for _, key := range zinstantConfigSyncKeys {
		if v, ok := generatedMap[key]; ok {
			existingMap[key] = v
		}
	}
	result, err := json.MarshalIndent(existingMap, "", "  ")
	if err != nil {
		return string(existing)
	}
	return string(result) + "\n"
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlug.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "screen"
	}
	return s
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func mustJSON(v interface{}) string {
	data, _ := json.MarshalIndent(v, "", "  ")
	return string(data) + "\n"
}

func jsonString(s string) string {
	data, _ := json.Marshal(s)
	return string(data)
}

func htmlQuote(s string) string {
	return jsonString(s)
}

func indentLines(s string, spaces int) string {
	prefix := strings.Repeat(" ", spaces)
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i, line := range lines {
		lines[i] = prefix + line
	}
	return strings.Join(lines, "\n") + "\n"
}
