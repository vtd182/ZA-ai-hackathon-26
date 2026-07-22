package core

import (
	"context"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"za-talk-to-figma/core/logging"
)

type argParamBuilder func(args map[string]interface{}) map[string]interface{}

var executionLogger = logging.Module("execution")

func executeCapability(ctx context.Context, runtime *Runtime, tool string, nodeIDs []string, params map[string]interface{}) (BridgeResponse, error) {
	result, err := runtime.Engine.ExecuteDetailed(ctx, tool, nodeIDs, params)
	logExecutionReport(result.Report, nodeIDs)
	return result.Response, err
}

func logExecutionReport(report ExecutionReport, nodeIDs []string) {
	level := executionLogger.Debug
	// Failed executions are worth surfacing at warn even in production.
	if report.ResultClass == ExecutionResultFailed {
		level = executionLogger.Warn
	}
	level("execution report",
		"requestId", report.RequestID,
		"capability", report.Capability,
		"kind", report.Kind,
		"profile", report.Profile,
		"result", report.ResultClass,
		"durationMs", report.DurationMs,
		"fallback", report.FallbackUsed,
		"attempts", len(report.Attempts),
		"nodeCount", len(nodeIDs),
	)
}

// intentToTitle converts a slug like "register-account" or "home_screen" to
// "Register Account" or "Home Screen" for use as a Figma node display name.
// ASCII-safe — suitable for intent slugs only.
func intentToTitle(slug string) string {
	words := strings.FieldsFunc(slug, func(r rune) bool {
		return r == '-' || r == '_' || r == ' '
	})
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func copyOptionalArg(dst map[string]interface{}, src map[string]interface{}, keys ...string) {
	for _, key := range keys {
		if value, ok := src[key]; ok {
			switch typed := value.(type) {
			case string:
				if typed == "" {
					continue
				}
			}
			dst[key] = value
		}
	}
}

func makeArgsHandler(runtime *Runtime, tool string, build argParamBuilder) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		params := args
		if build != nil {
			params = build(args)
		}
		resp, err := executeCapability(ctx, runtime, tool, nil, params)
		return renderResponse(resp, err)
	}
}

func makeSingleNodeHandler(runtime *Runtime, tool string, nodeArg string, normalize bool, build argParamBuilder) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		nodeID, _ := args[nodeArg].(string)
		if normalize {
			nodeID = NormalizeNodeID(nodeID)
		}
		params := map[string]interface{}{}
		if build != nil {
			params = build(args)
		}
		resp, err := executeCapability(ctx, runtime, tool, []string{nodeID}, params)
		return renderResponse(resp, err)
	}
}

func makeMultiNodeHandler(runtime *Runtime, tool string, nodeArg string, normalize bool, build argParamBuilder) func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		raw, _ := args[nodeArg].([]interface{})
		nodeIDs := toStringSlice(raw)
		if normalize {
			for i, id := range nodeIDs {
				nodeIDs[i] = NormalizeNodeID(id)
			}
		}
		params := map[string]interface{}{}
		if build != nil {
			params = build(args)
		}
		resp, err := executeCapability(ctx, runtime, tool, nodeIDs, params)
		return renderResponse(resp, err)
	}
}
