package core

import (
	"context"
	"testing"
)

func TestNodeHealth_UnknownRole(t *testing.T) {
	node := NewNode("127.0.0.1", 19941, "test-version")
	health := node.Health(context.Background())

	if health.Role != "UNKNOWN" {
		t.Errorf("role = %q, want UNKNOWN", health.Role)
	}
	if health.Version != "test-version" {
		t.Errorf("version = %q, want test-version", health.Version)
	}
	if health.PluginConnected {
		t.Error("expected pluginConnected=false with no leader")
	}
	if health.ClientID == "" {
		t.Error("expected a non-empty clientId")
	}
	if health.LogLevel == "" {
		t.Error("expected a non-empty logLevel")
	}
}

func TestRuntimeObservabilityTools_Smoke(t *testing.T) {
	s, _ := newTestServer(t)
	// Both tools must dispatch cleanly even with no Figma plugin connected.
	callTool(t, s, "get_runtime_health", map[string]any{})
	callTool(t, s, "get_recent_events", map[string]any{"limit": 10})
}
