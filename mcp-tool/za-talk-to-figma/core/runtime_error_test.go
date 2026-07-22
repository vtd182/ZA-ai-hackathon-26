package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

func TestClassifyError(t *testing.T) {
	tests := []struct {
		name          string
		err           error
		pluginErr     string
		wantCode      ErrorCode
		wantRetryable bool
		wantNil       bool
	}{
		{name: "no error", wantNil: true},
		{name: "plugin not connected", err: errPluginNotConnected(), wantCode: CodePluginNotConnected, wantRetryable: true},
		{name: "timeout sentinel", err: errRequestTimeout(nil), wantCode: CodeTimeout, wantRetryable: true},
		{name: "deadline exceeded", err: context.DeadlineExceeded, wantCode: CodeTimeout, wantRetryable: true},
		{name: "context canceled", err: context.Canceled, wantCode: CodeCanceled, wantRetryable: false},
		{name: "wrapped deadline", err: fmt.Errorf("exec: %w", context.DeadlineExceeded), wantCode: CodeTimeout, wantRetryable: true},
		{name: "transport send", err: errors.New("send: write tcp: broken pipe"), wantCode: CodeTransport, wantRetryable: true},
		{name: "transport rpc", err: errors.New("rpc call: connection refused"), wantCode: CodeTransport, wantRetryable: true},
		{name: "plugin not connected by string", err: errors.New("plugin not connected"), wantCode: CodePluginNotConnected, wantRetryable: true},
		{name: "unknown internal", err: errors.New("something odd"), wantCode: CodeInternal, wantRetryable: false},
		{name: "plugin domain error", pluginErr: "Node not found: 1:2", wantCode: CodePluginError, wantRetryable: false},
		{name: "transport err wins over plugin err", err: context.DeadlineExceeded, pluginErr: "Node not found", wantCode: CodeTimeout, wantRetryable: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := classifyError(tt.err, tt.pluginErr)
			if tt.wantNil {
				if got != nil {
					t.Fatalf("expected nil RuntimeError, got %+v", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("expected code %s, got nil", tt.wantCode)
			}
			if got.Code != tt.wantCode {
				t.Errorf("code = %s, want %s", got.Code, tt.wantCode)
			}
			if got.Retryable != tt.wantRetryable {
				t.Errorf("retryable = %v, want %v", got.Retryable, tt.wantRetryable)
			}
		})
	}
}

func TestClassifyErrorPassthrough(t *testing.T) {
	orig := newRuntimeError(CodeValidation, "bad arg", false, nil)
	got := classifyError(fmt.Errorf("wrapped: %w", orig), "")
	if got != orig {
		t.Fatalf("expected the wrapped RuntimeError to pass through unchanged, got %+v", got)
	}
}

func TestMarshalErrorEnvelope(t *testing.T) {
	rerr := errRequestTimeout(nil)
	body := marshalErrorEnvelope(rerr)

	var env struct {
		Error struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			Retryable bool   `json:"retryable"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(body), &env); err != nil {
		t.Fatalf("envelope is not valid JSON: %v (%s)", err, body)
	}
	if env.Error.Code != string(CodeTimeout) {
		t.Errorf("code = %s, want %s", env.Error.Code, CodeTimeout)
	}
	if !env.Error.Retryable {
		t.Error("expected retryable=true for timeout")
	}
	if env.Error.Message == "" {
		t.Error("expected a non-empty message")
	}
}
