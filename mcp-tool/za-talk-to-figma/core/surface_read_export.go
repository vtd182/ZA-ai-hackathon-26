package core

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/pdfcpu/pdfcpu/pkg/api"
)

func registerReadExportTools(s *server.MCPServer, runtime *Runtime) {
	s.AddTool(mcp.NewTool("get_screenshot",
		mcp.WithDescription("Export a screenshot of one or more nodes as base64-encoded image data (held in memory). Use save_screenshots instead when you want to write images directly to disk without base64 in the response."),
		mcp.WithArray("nodeIds",
			mcp.Description("Optional node IDs to export, colon format. If empty, exports current selection."),
			mcp.WithStringItems(),
		),
		mcp.WithString("format",
			mcp.Description("Export format: PNG (default), SVG, JPG, or PDF"),
		),
		mcp.WithNumber("scale",
			mcp.Description("Export scale for raster formats (default 2)"),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		params := map[string]interface{}{}
		if f, ok := req.GetArguments()["format"].(string); ok && f != "" {
			params["format"] = f
		}
		if s, ok := req.GetArguments()["scale"].(float64); ok && s > 0 {
			params["scale"] = s
		}
		params = injectOptionalSession(params, req)
		resp, err := runtime.Engine.Execute(ctx, "get_screenshot", nodeIDs, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("export_node_as_svg",
		mcp.WithDescription("Export a single Figma node as a raw SVG string. The returned svgContent can be passed directly to import_svg in a different session — this is the correct way to copy vector nodes (icons, illustrations, components) across files without needing a published Figma library. Workflow: export_node_as_svg(nodeId, sessionId=A) → import_svg(svgContent, sessionId=B)."),
		mcp.WithString("nodeId",
			mcp.Required(),
			mcp.Description("Node ID to export, colon format e.g. '4029:12345'"),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		nodeID, _ := req.GetArguments()["nodeId"].(string)
		if nodeID == "" {
			return mcp.NewToolResultError("nodeId is required"), nil
		}
		nodeID = NormalizeNodeID(nodeID)
		params := injectOptionalSession(map[string]interface{}{}, req)
		resp, err := runtime.Engine.Execute(ctx, "export_node_as_svg", []string{nodeID}, params)
		return renderResponse(resp, err)
	})

	s.AddTool(mcp.NewTool("export_frames_to_pdf",
		mcp.WithDescription("Export multiple frames as a single multi-page PDF file. Each frame becomes one page in order. Ideal for pitch decks, proposals, and slide exports."),
		mcp.WithArray("nodeIds",
			mcp.Required(),
			mcp.Description("Ordered list of frame node IDs to export as PDF pages, colon format e.g. '4029:12345'"),
			mcp.WithStringItems(),
		),
		mcp.WithString("outputPath",
			mcp.Required(),
			mcp.Description("File path to write the PDF to, must end in .pdf (relative to working directory or absolute)"),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := req.GetArguments()["nodeIds"].([]interface{})
		nodeIDs := toStringSlice(raw)
		outputPath, _ := req.GetArguments()["outputPath"].(string)
		if outputPath == "" {
			return mcp.NewToolResultError("outputPath is required"), nil
		}
		sessionID, _ := req.GetArguments()["sessionId"].(string)
		return executeExportFramesToPDF(ctx, runtime, nodeIDs, outputPath, sessionID)
	})

	s.AddTool(mcp.NewTool("save_screenshots",
		mcp.WithDescription("Export screenshots for multiple nodes and write them to the local filesystem. Returns file metadata (path, size, dimensions) — no base64 in the response. Use get_screenshot instead when you need the image data in memory."),
		mcp.WithArray("items",
			mcp.Required(),
			mcp.Description("List of {nodeId, outputPath, format?, scale?} objects"),
			mcp.Items(map[string]any{
				"type": "object",
				"properties": map[string]any{
					"nodeId":     map[string]any{"type": "string", "description": "Node ID in colon format e.g. '4029:12345'"},
					"outputPath": map[string]any{"type": "string", "description": "File path to write the image to"},
					"format":     map[string]any{"type": "string", "description": "Export format: PNG, SVG, JPG, or PDF"},
					"scale":      map[string]any{"type": "number", "description": "Export scale for raster formats"},
				},
				"required": []string{"nodeId", "outputPath"},
			}),
		),
		mcp.WithString("format",
			mcp.Description("Default export format: PNG (default), SVG, JPG, or PDF"),
		),
		mcp.WithNumber("scale",
			mcp.Description("Default export scale for raster formats (default 2)"),
		),
		withOptionalSessionTarget(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return executeSaveScreenshots(ctx, runtime, req)
	})
}

func executeExportFramesToPDF(ctx context.Context, runtime *Runtime, nodeIDs []string, outputPath string, sessionID string) (*mcp.CallToolResult, error) {
	workDir, err := os.Getwd()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("getwd: %v", err)), nil
	}
	resolvedPath, err := resolveOutputPath(outputPath, workDir)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if strings.ToLower(filepath.Ext(resolvedPath)) != ".pdf" {
		return mcp.NewToolResultError("outputPath must have a .pdf extension"), nil
	}

	params := map[string]interface{}{}
	if sessionID != "" {
		params["sessionId"] = sessionID
	}
	if len(params) == 0 {
		params = nil
	}
	resp, err := runtime.Engine.Execute(ctx, "export_frames_to_pdf", nodeIDs, params)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if resp.Error != "" {
		return mcp.NewToolResultError(resp.Error), nil
	}

	pages, err := extractFramePDFs(resp.Data)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	merged, err := mergePDFPages(pages)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("merge PDFs: %v", err)), nil
	}

	if err := os.MkdirAll(filepath.Dir(resolvedPath), 0o755); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("mkdir: %v", err)), nil
	}
	if _, statErr := os.Stat(resolvedPath); statErr == nil {
		return mcp.NewToolResultError(fmt.Sprintf("file already exists: %s", resolvedPath)), nil
	}
	if err := os.WriteFile(resolvedPath, merged, 0o644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("write file: %v", err)), nil
	}

	out, _ := json.Marshal(map[string]interface{}{
		"outputPath":   resolvedPath,
		"bytesWritten": len(merged),
		"pageCount":    len(pages),
		"success":      true,
	})
	return mcp.NewToolResultText(string(out)), nil
}

// extractFramePDFs parses the plugin response `{frames:[{base64:...},...]}` and
// returns raw PDF bytes for each frame.
func extractFramePDFs(data interface{}) ([][]byte, error) {
	b, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		Frames []struct {
			Base64 string `json:"base64"`
		} `json:"frames"`
	}
	if err := json.Unmarshal(b, &wrapper); err != nil {
		return nil, err
	}
	if len(wrapper.Frames) == 0 {
		return nil, errors.New("no PDF frames returned by plugin")
	}
	pages := make([][]byte, 0, len(wrapper.Frames))
	for i, f := range wrapper.Frames {
		if f.Base64 == "" {
			return nil, fmt.Errorf("frame %d has empty base64", i)
		}
		raw, err := base64.StdEncoding.DecodeString(f.Base64)
		if err != nil {
			return nil, fmt.Errorf("frame %d: base64 decode: %w", i, err)
		}
		pages = append(pages, raw)
	}
	return pages, nil
}

// mergePDFPages merges one or more single-page PDFs into one multi-page PDF
// using pdfcpu. Each element of pages must be a valid PDF byte slice.
func mergePDFPages(pages [][]byte) ([]byte, error) {
	if len(pages) == 0 {
		return nil, errors.New("no pages to merge")
	}
	readers := make([]io.ReadSeeker, len(pages))
	for i, p := range pages {
		readers[i] = bytes.NewReader(p)
	}
	var buf bytes.Buffer
	if err := api.MergeRaw(readers, &buf, false, nil); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
