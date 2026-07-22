package core

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

// ErrorCode is a stable, machine-readable classification of a tool failure.
// Clients should branch on the code, not on the human-readable message, since
// messages may change. Codes are part of the runtime's public contract.
type ErrorCode string

const (
	// CodePluginNotConnected — no Figma plugin is connected to the runtime.
	// The client should prompt the user to open the plugin, then retry.
	CodePluginNotConnected ErrorCode = "PLUGIN_NOT_CONNECTED"
	// CodeTimeout — the plugin did not respond within the capability's deadline.
	// Usually a heavy read on a large file; retry with tighter budgets.
	CodeTimeout ErrorCode = "TIMEOUT"
	// CodeCanceled — the caller's context was canceled before completion.
	CodeCanceled ErrorCode = "CANCELED"
	// CodeTransport — the WebSocket/RPC channel failed (write error, RPC call
	// failed, malformed wire payload). The runtime is reachable but the message
	// did not round-trip.
	CodeTransport ErrorCode = "TRANSPORT_ERROR"
	// CodePluginError — the plugin received the request but reported a
	// domain/logic error (e.g. "Node not found", "Parent cannot have children").
	CodePluginError ErrorCode = "PLUGIN_ERROR"
	// CodeValidation — the request was rejected before execution (bad arguments).
	CodeValidation ErrorCode = "VALIDATION_ERROR"
	// CodeInternal — an unexpected server-side failure (marshal error, bug).
	CodeInternal ErrorCode = "INTERNAL_ERROR"
)

// RuntimeError is a typed, classified runtime failure. It implements error and
// supports errors.Is/As unwrapping of the underlying cause.
type RuntimeError struct {
	Code      ErrorCode `json:"code"`
	Message   string    `json:"message"`
	Retryable bool      `json:"retryable"`
	cause     error
}

func (e *RuntimeError) Error() string {
	if e == nil {
		return ""
	}
	return string(e.Code) + ": " + e.Message
}

func (e *RuntimeError) Unwrap() error { return e.cause }

func newRuntimeError(code ErrorCode, message string, retryable bool, cause error) *RuntimeError {
	return &RuntimeError{Code: code, Message: message, Retryable: retryable, cause: cause}
}

// Typed constructors for the failures the transport raises directly. Returning
// these (instead of errors.New) lets the render layer classify without string
// matching.
func errPluginNotConnected() *RuntimeError {
	return newRuntimeError(CodePluginNotConnected, "plugin not connected — open the za-talk-to-figma plugin in Figma and try again", true, nil)
}

func errRequestTimeout(cause error) *RuntimeError {
	return newRuntimeError(CodeTimeout, "request timed out — the file may be large; retry with tighter depth/maxNodes/maxTimeMs budgets", true, cause)
}

// classifyError maps an arbitrary execution error and the plugin-reported error
// string into a single typed RuntimeError. Returns nil when there is no error.
//
// Precedence: a transport-level err wins over a plugin error string, because a
// transport failure means the plugin error (if any) never round-tripped
// reliably.
func classifyError(err error, pluginErr string) *RuntimeError {
	if err == nil && pluginErr == "" {
		return nil
	}

	if err != nil {
		// Already classified upstream — pass through.
		var re *RuntimeError
		if errors.As(err, &re) {
			return re
		}
		switch {
		case errors.Is(err, context.DeadlineExceeded):
			return errRequestTimeout(err)
		case errors.Is(err, context.Canceled):
			return newRuntimeError(CodeCanceled, "request canceled before completion", false, err)
		}
		msg := err.Error()
		switch {
		case strings.Contains(msg, "plugin not connected"):
			return errPluginNotConnected()
		case strings.Contains(msg, "timed out"):
			return errRequestTimeout(err)
		case strings.HasPrefix(msg, "send:"),
			strings.HasPrefix(msg, "rpc call:"),
			strings.HasPrefix(msg, "unmarshal:"),
			strings.HasPrefix(msg, "marshal:"),
			strings.HasPrefix(msg, "read response:"),
			strings.Contains(msg, "websocket"):
			return newRuntimeError(CodeTransport, msg, true, err)
		default:
			return newRuntimeError(CodeInternal, msg, false, err)
		}
	}

	// No transport error, but the plugin reported a domain error.
	return newRuntimeError(CodePluginError, pluginErr, false, nil)
}

// errorEnvelope is the JSON shape returned to MCP clients on failure.
type errorEnvelope struct {
	Error *RuntimeError `json:"error"`
}

// marshalErrorEnvelope renders a typed error as the JSON text body of an MCP
// error result, e.g. {"error":{"code":"TIMEOUT","message":"...","retryable":true}}.
func marshalErrorEnvelope(rerr *RuntimeError) string {
	b, err := json.Marshal(errorEnvelope{Error: rerr})
	if err != nil {
		// Should never happen; fall back to the raw message.
		return rerr.Error()
	}
	return string(b)
}
