package core

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"
)

// ExecutionEngine centralizes tool execution policy so capability behavior
// can evolve independently from MCP handler boilerplate.
type ExecutionEngine struct {
	node     *Node
	registry *CapabilityRegistry
}

func NewExecutionEngine(node *Node, registry *CapabilityRegistry) *ExecutionEngine {
	return &ExecutionEngine{node: node, registry: registry}
}

func (e *ExecutionEngine) Execute(ctx context.Context, capability string, nodeIDs []string, params map[string]interface{}) (BridgeResponse, error) {
	result, err := e.ExecuteDetailed(ctx, capability, nodeIDs, params)
	return result.Response, err
}

func (e *ExecutionEngine) ExecuteDetailed(ctx context.Context, capability string, nodeIDs []string, params map[string]interface{}) (ExecutedResponse, error) {
	cap := e.registry.Resolve(capability)
	report := newExecutionReport(cap)
	startedAt := time.Now()
	report.RequestID = fmt.Sprintf("exec-%d", startedAt.UnixNano())
	sessionID, _, _ := extractRoutingHints(params)

	if _, hasDeadline := ctx.Deadline(); !hasDeadline && cap.DefaultTimeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cap.DefaultTimeout)
		defer cancel()
	}

	attemptStartedAt := time.Now()
	resp, err := e.node.Send(ctx, capability, nodeIDs, params)
	if resp.RequestID != "" {
		report.RequestID = resp.RequestID
	}
	report.Attempts = append(report.Attempts, newAttempt(capability, cap.Profile, attemptStartedAt, attemptOutcome(resp, err), params, err))
	if err != nil && shouldRetryWithFallback(err) {
		if retryResp, retryErr, ok := e.retryHeavyRead(ctx, cap, capability, nodeIDs, params); ok {
			if retryResp.response.RequestID != "" {
				report.RequestID = retryResp.response.RequestID
			}
			report.Attempts = append(report.Attempts, newAttempt(capability, cap.Profile, retryResp.startedAt, attemptOutcome(retryResp.response, retryErr), retryResp.params, retryErr))
			report.DurationMs = time.Since(startedAt).Milliseconds()
			if retryErr == nil {
				report.ResultClass = ExecutionResultFallback
				report.FallbackUsed = true
				report.FallbackPath = append(report.FallbackPath, "compact_retry")
				e.publishExecutionReport(ctx, sessionID, report)
				return ExecutedResponse{Response: retryResp.response, Report: report}, nil
			}
		}
		if cap.SupportsFallback && cap.FallbackCapability != "" {
			fallbackParams := compactFallbackParams(params)
			fallbackCap := e.registry.Resolve(cap.FallbackCapability)
			fallbackStartedAt := time.Now()
			fallbackResp, fallbackErr := e.node.Send(ctx, cap.FallbackCapability, nodeIDs, fallbackParams)
			if fallbackResp.RequestID != "" {
				report.RequestID = fallbackResp.RequestID
			}
			report.Attempts = append(report.Attempts, newAttempt(cap.FallbackCapability, fallbackCap.Profile, fallbackStartedAt, attemptOutcome(fallbackResp, fallbackErr), fallbackParams, fallbackErr))
			report.DurationMs = time.Since(startedAt).Milliseconds()
			report.FallbackUsed = true
			report.FallbackPath = append(report.FallbackPath, cap.FallbackCapability)
			if fallbackErr != nil {
				report.ResultClass = ExecutionResultFailed
				e.publishExecutionReport(ctx, sessionID, report)
				return ExecutedResponse{Response: fallbackResp, Report: report}, fallbackErr
			}
			report.ResultClass = ExecutionResultFallback
			e.publishExecutionReport(ctx, sessionID, report)
			return ExecutedResponse{Response: fallbackResp, Report: report}, nil
		}
	}
	report.DurationMs = time.Since(startedAt).Milliseconds()
	if err != nil {
		report.ResultClass = ExecutionResultFailed
		e.publishExecutionReport(ctx, sessionID, report)
		return ExecutedResponse{Response: resp, Report: report}, err
	}
	if resp.Error != "" {
		report.ResultClass = ExecutionResultFailed
	} else if cap.SupportsTruncation && responseLooksPartial(resp.Data) {
		report.ResultClass = ExecutionResultPartial
	}
	e.publishExecutionReport(ctx, sessionID, report)
	return ExecutedResponse{Response: resp, Report: report}, nil
}

type retryResult struct {
	response  BridgeResponse
	params    map[string]interface{}
	startedAt time.Time
}

func (e *ExecutionEngine) retryHeavyRead(ctx context.Context, cap Capability, capability string, nodeIDs []string, params map[string]interface{}) (retryResult, error, bool) {
	if cap.Profile != ExecutionProfileHeavyRead {
		return retryResult{}, nil, false
	}
	retryParams := compactFallbackParams(params)
	if sameParams(params, retryParams) {
		return retryResult{}, nil, false
	}
	startedAt := time.Now()
	resp, err := e.node.Send(ctx, capability, nodeIDs, retryParams)
	return retryResult{response: resp, params: retryParams, startedAt: startedAt}, err, true
}

func cloneParams(params map[string]interface{}) map[string]interface{} {
	if len(params) == 0 {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(params))
	for key, value := range params {
		out[key] = value
	}
	return out
}

func shouldRetryWithFallback(err error) bool {
	return errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)
}

func compactFallbackParams(params map[string]interface{}) map[string]interface{} {
	out := cloneParams(params)
	if _, ok := out["detail"]; !ok || out["detail"] == "full" {
		out["detail"] = "compact"
	}
	if _, ok := out["compactInstances"]; !ok {
		out["compactInstances"] = true
	}
	if _, ok := out["depth"]; !ok {
		out["depth"] = 3
	}
	if _, ok := out["maxNodes"]; !ok {
		out["maxNodes"] = 1200
	}
	if _, ok := out["maxTimeMs"]; !ok {
		out["maxTimeMs"] = 8000
	}
	return out
}

func sameParams(a, b map[string]interface{}) bool {
	if len(a) != len(b) {
		return false
	}
	for key, value := range a {
		if !reflect.DeepEqual(b[key], value) {
			return false
		}
	}
	return true
}

func attemptOutcome(resp BridgeResponse, err error) string {
	if err != nil {
		return "transport_error"
	}
	if resp.Error != "" {
		return "plugin_error"
	}
	if responseLooksPartial(resp.Data) {
		return "partial"
	}
	return "ok"
}

func responseLooksPartial(data interface{}) bool {
	switch typed := data.(type) {
	case map[string]interface{}:
		return dataMapLooksPartial(typed)
	default:
		return false
	}
}

func dataMapLooksPartial(data map[string]any) bool {
	if truncated, ok := data["truncated"].(bool); ok && truncated {
		return true
	}
	if fallbackUsed, ok := data["fallbackUsed"].(bool); ok && fallbackUsed {
		return true
	}
	if _, ok := data["recommendedNextCalls"]; ok {
		return true
	}
	return false
}

func (e *ExecutionEngine) publishExecutionReport(ctx context.Context, sessionID string, report ExecutionReport) {
	eventCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = e.node.PublishRuntimeEvent(eventCtx, RuntimeEvent{
		Type:      "execution_report",
		SessionID: sessionID,
		RequestID: report.RequestID,
		Data:      report,
	})
}
