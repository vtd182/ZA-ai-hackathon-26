package core

import "time"

type ExecutionResultClass string

const (
	ExecutionResultComplete ExecutionResultClass = "complete"
	ExecutionResultPartial  ExecutionResultClass = "partial"
	ExecutionResultFallback ExecutionResultClass = "fallback"
	ExecutionResultFailed   ExecutionResultClass = "failed"
)

type ExecutionAttempt struct {
	Capability string         `json:"capability"`
	Profile    string         `json:"profile"`
	DurationMs int64          `json:"durationMs"`
	Outcome    string         `json:"outcome"`
	Error      string         `json:"error,omitempty"`
	UsedParams map[string]any `json:"usedParams,omitempty"`
}

type ExecutionReport struct {
	RequestID        string               `json:"requestId"`
	Capability       string               `json:"capability"`
	Kind             string               `json:"kind"`
	Profile          string               `json:"profile"`
	DurationMs       int64                `json:"durationMs"`
	Attempts         []ExecutionAttempt   `json:"attempts"`
	FallbackUsed     bool                 `json:"fallbackUsed"`
	FallbackPath     []string             `json:"fallbackPath,omitempty"`
	ResultClass      ExecutionResultClass `json:"resultClass"`
	SupportsProgress bool                 `json:"supportsProgress"`
}

type ExecutedResponse struct {
	Response BridgeResponse
	Report   ExecutionReport
}

func newExecutionReport(cap Capability) ExecutionReport {
	return ExecutionReport{
		Capability:       cap.Name,
		Kind:             string(cap.Kind),
		Profile:          string(cap.Profile),
		ResultClass:      ExecutionResultComplete,
		SupportsProgress: cap.SupportsProgress,
	}
}

func newAttempt(capability string, profile ExecutionProfile, startedAt time.Time, outcome string, params map[string]any, err error) ExecutionAttempt {
	attempt := ExecutionAttempt{
		Capability: capability,
		Profile:    string(profile),
		DurationMs: time.Since(startedAt).Milliseconds(),
		Outcome:    outcome,
		UsedParams: summarizeParams(params),
	}
	if err != nil {
		attempt.Error = err.Error()
	}
	return attempt
}

func summarizeParams(params map[string]any) map[string]any {
	if len(params) == 0 {
		return nil
	}
	out := map[string]any{}
	for key, value := range params {
		switch key {
		case "detail", "depth", "maxNodes", "maxTimeMs", "compactInstances", "limit", "maxVisited", "format", "scale":
			out[key] = value
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
