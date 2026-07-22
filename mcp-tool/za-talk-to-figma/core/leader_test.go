package core

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ── handlePing ────────────────────────────────────────────────────────────────

func TestLeaderHandlePing_OK(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "v1.2.3")

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	w := httptest.NewRecorder()
	l.handlePing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %q, want ok", body["status"])
	}
	if body["version"] != "v1.2.3" {
		t.Errorf("version = %q, want v1.2.3", body["version"])
	}
}

func TestLeaderHandlePing_MethodNotAllowed(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/ping", nil)
		w := httptest.NewRecorder()
		l.handlePing(w, req)

		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s /ping: status = %d, want 405", method, w.Code)
		}
	}
}

func TestLeaderHandleRoot_RedirectsToAdmin(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	l.handleRoot(w, req)

	if w.Code != http.StatusTemporaryRedirect {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusTemporaryRedirect)
	}
	if got := w.Header().Get("Location"); got != "/admin" {
		t.Fatalf("Location = %q, want /admin", got)
	}
}

func TestLeaderHandleRoot_NotFoundForOtherPaths(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	req := httptest.NewRequest(http.MethodGet, "/unknown", nil)
	w := httptest.NewRecorder()
	l.handleRoot(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

// ── handleRPC ─────────────────────────────────────────────────────────────────

func TestLeaderHandleRPC_MethodNotAllowed(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	req := httptest.NewRequest(http.MethodGet, "/rpc", nil)
	w := httptest.NewRecorder()
	l.handleRPC(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestLeaderHandleRPC_InvalidJSON(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	req := httptest.NewRequest(http.MethodPost, "/rpc", bytes.NewBufferString("{bad json}"))
	w := httptest.NewRecorder()
	l.handleRPC(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	var resp RPCResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == "" {
		t.Error("expected error in response body")
	}
}

func TestLeaderHandleRPC_ValidationError(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	// set_text with nodeId but missing text → validation error
	body, _ := json.Marshal(RPCRequest{
		Tool:    "set_text",
		NodeIDs: []string{"1:1"},
		Params:  map[string]any{},
	})
	req := httptest.NewRequest(http.MethodPost, "/rpc", bytes.NewReader(body))
	w := httptest.NewRecorder()
	l.handleRPC(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	var resp RPCResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == "" {
		t.Error("expected validation error in response")
	}
}

func TestLeaderHandleRPC_BridgeNotConnected(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")

	// get_document has no required params — passes validation, hits bridge
	body, _ := json.Marshal(RPCRequest{Tool: "get_document"})
	req := httptest.NewRequest(http.MethodPost, "/rpc", bytes.NewReader(body))
	w := httptest.NewRecorder()
	l.handleRPC(w, req)

	// Bridge returns "plugin not connected" error → 200 with error field
	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var resp RPCResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == "" {
		t.Error("expected 'plugin not connected' error in response")
	}
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

func TestLeaderStart_BindsPort(t *testing.T) {
	port := freePort(t)
	l := NewLeader("127.0.0.1", port, "")

	if err := l.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(l.Stop)

	// Second leader on the same port must fail.
	l2 := NewLeader("127.0.0.1", port, "")
	if err := l2.Start(); err == nil {
		l2.Stop()
		t.Error("expected error when binding already-used port")
	}
}

func TestLeaderStop_FreesPort(t *testing.T) {
	port := freePort(t)
	l := NewLeader("127.0.0.1", port, "")

	if err := l.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	l.Stop()

	// Allow OS to release the port.
	time.Sleep(20 * time.Millisecond)

	l2 := NewLeader("127.0.0.1", port, "")
	if err := l2.Start(); err != nil {
		t.Fatalf("port should be free after Stop: %v", err)
	}
	l2.Stop()
}

func TestLeaderStop_Idempotent(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")
	// Stop on a never-started leader should not panic.
	l.Stop()
	l.Stop()
}

// ── /ping endpoint (integration via httptest.Server) ─────────────────────────

func TestLeaderPingEndpoint(t *testing.T) {
	port := freePort(t)
	l := NewLeader("127.0.0.1", port, "test-ver")
	if err := l.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(l.Stop)

	f := NewFollower("http://127.0.0.1:" + itoa(port))
	if !f.Ping(t.Context()) {
		t.Error("expected ping to succeed for running leader")
	}
}

func TestLeaderHandleAdminOverview(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "test-ver")
	l.bridge.activeSession = "figma:test"
	l.bridge.activeByClient["stdio:1"] = "figma:test"
	l.bridge.pending = map[string]*pendingEntry{"req-1": {}}

	req := httptest.NewRequest(http.MethodGet, "/admin/overview", nil)
	w := httptest.NewRecorder()
	l.handleAdminOverview(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if body["role"] != "leader" {
		t.Fatalf("role = %v, want leader", body["role"])
	}
	if body["version"] != "test-ver" {
		t.Fatalf("version = %v, want test-ver", body["version"])
	}
	if body["activeSession"] != "figma:test" {
		t.Fatalf("activeSession = %v, want figma:test", body["activeSession"])
	}
	if body["clientCount"] != float64(1) {
		t.Fatalf("clientCount = %v, want 1", body["clientCount"])
	}
}

func TestLeaderHandleAdminEvents(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")
	l.bridge.recordEvent(RuntimeEvent{
		Type:      "execution_report",
		SessionID: "figma:test",
		RequestID: "req-1",
		Data:      map[string]any{"resultClass": "complete"},
	})
	_ = l.bridge.PublishEvent(context.Background(), "", RuntimeEvent{
		Type:      "execution_report",
		SessionID: "figma:test-2",
		RequestID: "req-2",
		Data:      map[string]any{"resultClass": "partial"},
	})

	req := httptest.NewRequest(http.MethodGet, "/admin/events", nil)
	w := httptest.NewRecorder()
	l.handleAdminEvents(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if len(body.Events) < 2 {
		t.Fatalf("events len = %d, want >= 2", len(body.Events))
	}
}

func TestLeaderHandleAdminReload(t *testing.T) {
	l := NewLeader("127.0.0.1", 0, "")
	reloaded := make(chan struct{}, 1)
	l.reload = func() error {
		select {
		case reloaded <- struct{}{}:
		default:
		}
		return nil
	}

	req := httptest.NewRequest(http.MethodPost, "/admin/reload", nil)
	w := httptest.NewRecorder()
	l.handleAdminReload(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	data, ok := body["data"].(map[string]any)
	if !ok || data["reloading"] != true {
		t.Fatalf("unexpected reload payload: %+v", body)
	}

	select {
	case <-reloaded:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("reload callback was not triggered")
	}
}
