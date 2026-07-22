package core

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"za-talk-to-figma/core/playbooks"
)

// RegisterTools registers all MCP tools on the server.
func RegisterTools(s *server.MCPServer, node *Node) {
	runtime := NewRuntime(node)
	registerReadTools(s, runtime)
	registerWriteTools(s, runtime)
	registerSmartTools(s, runtime)
	registerRuntimeObservabilityTools(s, runtime)
}

// RegisterPrompts registers MCP prompts on the server.
func RegisterPrompts(s *server.MCPServer) {
	playbooks.RegisterAll(s)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// makeHandler creates a simple tool handler with no parameters.
func makeHandler(runtime *Runtime, command string, nodeIDs []string, params map[string]interface{}) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		merged := cloneParams(params)
		merged = injectOptionalSession(merged, req)
		if len(merged) == 0 {
			merged = nil
		}
		resp, err := executeCapability(ctx, runtime, command, nodeIDs, merged)
		return renderResponse(resp, err)
	}
}

func withOptionalSessionTarget() mcp.ToolOption {
	return mcp.WithString("sessionId",
		mcp.Description("Optional runtime sessionId to target a specific connected Figma file/plugin instance. If omitted, the active session is used."),
	)
}

func injectOptionalSession(params map[string]interface{}, req mcp.CallToolRequest) map[string]interface{} {
	if sessionID, ok := req.GetArguments()["sessionId"].(string); ok && sessionID != "" {
		if params == nil {
			params = map[string]interface{}{}
		}
		params["sessionId"] = sessionID
	}
	return params
}

// renderResponse converts a BridgeResponse into an MCP tool result. Failures
// are returned as a typed JSON envelope ({"error":{"code","message","retryable"}})
// so clients can distinguish a timeout from a disconnect from a plugin-side
// logic error without parsing prose.
func renderResponse(resp BridgeResponse, err error) (*mcp.CallToolResult, error) {
	if rerr := classifyError(err, resp.Error); rerr != nil {
		return mcp.NewToolResultError(marshalErrorEnvelope(rerr)), nil
	}
	text, marshalErr := json.Marshal(resp.Data)
	if marshalErr != nil {
		rerr := newRuntimeError(CodeInternal, fmt.Sprintf("marshal response: %v", marshalErr), false, marshalErr)
		return mcp.NewToolResultError(marshalErrorEnvelope(rerr)), nil
	}
	return mcp.NewToolResultText(string(text)), nil
}

// toStringSlice converts []interface{} to []string.
func toStringSlice(raw []interface{}) []string {
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// ── save_screenshots ─────────────────────────────────────────────────────────

type saveItem struct {
	NodeID     string  `json:"nodeId"`
	OutputPath string  `json:"outputPath"`
	Format     string  `json:"format,omitempty"`
	Scale      float64 `json:"scale,omitempty"`
}

type saveResult struct {
	Index        int     `json:"index"`
	NodeID       string  `json:"nodeId"`
	NodeName     string  `json:"nodeName,omitempty"`
	OutputPath   string  `json:"outputPath"`
	Format       string  `json:"format,omitempty"`
	Width        float64 `json:"width,omitempty"`
	Height       float64 `json:"height,omitempty"`
	BytesWritten int     `json:"bytesWritten,omitempty"`
	Success      bool    `json:"success"`
	Error        string  `json:"error,omitempty"`
}

func executeSaveScreenshots(ctx context.Context, runtime *Runtime, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	rawItems, _ := req.GetArguments()["items"].([]interface{})
	defaultFormat, _ := req.GetArguments()["format"].(string)
	defaultScale, _ := req.GetArguments()["scale"].(float64)
	sessionID, _ := req.GetArguments()["sessionId"].(string)

	workDir, err := os.Getwd()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("getwd: %v", err)), nil
	}

	results := make([]saveResult, 0, len(rawItems))
	succeeded, failed := 0, 0

	for i, rawItem := range rawItems {
		item, err := parseSaveItem(rawItem)
		if err != nil {
			results = append(results, saveResult{Index: i, Error: err.Error()})
			failed++
			continue
		}

		r := saveScreenshotItem(ctx, runtime, item, i, workDir, defaultFormat, defaultScale, sessionID)
		results = append(results, r)
		if r.Success {
			succeeded++
		} else {
			failed++
		}
	}

	out, err := json.Marshal(map[string]interface{}{
		"total":     len(results),
		"succeeded": succeeded,
		"failed":    failed,
		"hasErrors": failed > 0,
		"results":   results,
	})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal results: %v", err)), nil
	}
	return mcp.NewToolResultText(string(out)), nil
}

func saveScreenshotItem(ctx context.Context, runtime *Runtime, item saveItem, index int, workDir, defaultFormat string, defaultScale float64, sessionID string) saveResult {
	resolvedPath, err := resolveOutputPath(item.OutputPath, workDir)
	if err != nil {
		return saveResult{Index: index, NodeID: item.NodeID, OutputPath: item.OutputPath, Error: err.Error()}
	}

	format := coalesce(item.Format, defaultFormat)
	inferredFormat := inferFormat(resolvedPath)
	if format == "" {
		format = inferredFormat
	}
	if format == "" {
		format = "PNG"
	}
	if inferredFormat != "" && format != inferredFormat {
		return saveResult{Index: index, NodeID: item.NodeID, OutputPath: resolvedPath,
			Error: fmt.Sprintf("format %s conflicts with file extension %s", format, inferredFormat)}
	}

	scale := item.Scale
	if scale <= 0 {
		scale = defaultScale
	}

	params := map[string]interface{}{"format": format}
	if scale > 0 {
		params["scale"] = scale
	}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}

	resp, err := executeCapability(ctx, runtime, "get_screenshot", []string{item.NodeID}, params)
	if err != nil {
		return saveResult{Index: index, NodeID: item.NodeID, OutputPath: resolvedPath, Error: err.Error()}
	}
	if resp.Error != "" {
		return saveResult{Index: index, NodeID: item.NodeID, OutputPath: resolvedPath, Error: resp.Error}
	}

	export, err := extractScreenshotExport(resp.Data)
	if err != nil {
		return saveResult{Index: index, NodeID: item.NodeID, OutputPath: resolvedPath, Error: err.Error()}
	}

	bytes, err := writeBase64(export.Base64, resolvedPath)
	if err != nil {
		return saveResult{Index: index, NodeID: item.NodeID, OutputPath: resolvedPath, Error: err.Error()}
	}

	return saveResult{
		Index:        index,
		NodeID:       export.NodeID,
		NodeName:     export.NodeName,
		OutputPath:   resolvedPath,
		Format:       format,
		Width:        export.Width,
		Height:       export.Height,
		BytesWritten: bytes,
		Success:      true,
	}
}

type screenshotExport struct {
	NodeID   string  `json:"nodeId"`
	NodeName string  `json:"nodeName"`
	Base64   string  `json:"base64"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
}

func extractScreenshotExport(data interface{}) (screenshotExport, error) {
	b, err := json.Marshal(data)
	if err != nil {
		return screenshotExport{}, err
	}
	var wrapper struct {
		Exports []screenshotExport `json:"exports"`
	}
	if err := json.Unmarshal(b, &wrapper); err != nil {
		return screenshotExport{}, err
	}
	if len(wrapper.Exports) == 0 {
		return screenshotExport{}, errors.New("no screenshot export returned by plugin")
	}
	return wrapper.Exports[0], nil
}

func writeBase64(b64, outputPath string) (int, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return 0, fmt.Errorf("base64 decode: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return 0, fmt.Errorf("mkdir: %w", err)
	}
	f, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		if os.IsExist(err) {
			return 0, fmt.Errorf("file already exists at outputPath: %s", outputPath)
		}
		return 0, err
	}
	defer f.Close()
	n, err := f.Write(data)
	return n, err
}

func resolveOutputPath(outputPath, workDir string) (string, error) {
	if filepath.IsAbs(outputPath) {
		return mustBeInsideDir(filepath.Clean(outputPath), workDir)
	}
	return mustBeInsideDir(filepath.Join(workDir, outputPath), workDir)
}

func mustBeInsideDir(resolved, workDir string) (string, error) {
	rel, err := filepath.Rel(workDir, resolved)
	if err != nil {
		return "", fmt.Errorf("outputPath must be inside the working directory: %s", workDir)
	}
	// Convert to forward slashes before prefix check so Windows paths like
	// "C:\.." don't bypass the ".." detection.
	if strings.HasPrefix(filepath.ToSlash(rel), "..") {
		return "", fmt.Errorf("outputPath must be inside the working directory: %s", workDir)
	}
	return resolved, nil
}

func inferFormat(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		return "PNG"
	case ".svg":
		return "SVG"
	case ".jpg", ".jpeg":
		return "JPG"
	case ".pdf":
		return "PDF"
	}
	return ""
}

func parseSaveItem(raw interface{}) (saveItem, error) {
	b, err := json.Marshal(raw)
	if err != nil {
		return saveItem{}, err
	}
	var item saveItem
	if err := json.Unmarshal(b, &item); err != nil {
		return saveItem{}, err
	}
	return item, nil
}

func coalesce(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
