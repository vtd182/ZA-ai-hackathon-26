package core

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// setupBridgeWithClient creates a Bridge with an active WebSocket client connected to it.
// Returns the bridge and the client-side connection (already cleaned up on t.Cleanup).
func setupBridgeWithClient(t *testing.T) (*Bridge, *websocket.Conn) {
	t.Helper()
	bridge := NewBridge()

	srv := httptest.NewServer(http.HandlerFunc(bridge.HandleUpgrade))
	t.Cleanup(srv.Close)

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	clientConn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	t.Cleanup(func() { clientConn.Close(websocket.StatusNormalClosure, "") })

	// Poll until bridge registers the server-side connection.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if bridge.IsConnected() {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !bridge.IsConnected() {
		t.Fatal("bridge not connected after 500ms")
	}

	return bridge, clientConn
}

// ── NewBridge ─────────────────────────────────────────────────────────────────

func TestNewBridge(t *testing.T) {
	b := NewBridge()
	if b == nil {
		t.Fatal("NewBridge returned nil")
	}
	if b.IsConnected() {
		t.Error("new bridge should not be connected")
	}
}

// ── nextID ────────────────────────────────────────────────────────────────────

func TestBridgeNextID(t *testing.T) {
	b := NewBridge()
	id1 := b.nextID()
	id2 := b.nextID()

	if id1 == id2 {
		t.Error("consecutive IDs must be unique")
	}
	if !strings.HasPrefix(id1, "req-") {
		t.Errorf("ID %q does not have req- prefix", id1)
	}
	// Format: req-HHMMSS-N  (14 chars min: "req-000000-1")
	parts := strings.Split(id1, "-")
	if len(parts) != 3 {
		t.Errorf("ID %q has wrong format (want 3 dash-separated parts)", id1)
	}
}

// ── MarshalJSON ───────────────────────────────────────────────────────────────

func TestBridgeMarshalJSON_Disconnected(t *testing.T) {
	b := NewBridge()
	data, err := b.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	var m map[string]any
	json.Unmarshal(data, &m)
	if m["connected"] != false {
		t.Errorf("connected = %v, want false", m["connected"])
	}
	if m["pending"] != float64(0) {
		t.Errorf("pending = %v, want 0", m["pending"])
	}
}

func TestBridgeMarshalJSON_Connected(t *testing.T) {
	b, _ := setupBridgeWithClient(t)
	data, err := b.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	var m map[string]any
	json.Unmarshal(data, &m)
	if m["connected"] != true {
		t.Errorf("connected = %v, want true", m["connected"])
	}
}

// ── Close ─────────────────────────────────────────────────────────────────────

func TestBridgeClose_NoPanic(t *testing.T) {
	b := NewBridge()
	// Close on an unconnected bridge should not panic.
	b.Close()
}

func TestBridgeClose_DrainsPending(t *testing.T) {
	b, _ := setupBridgeWithClient(t)

	// Manually insert a pending entry so we can verify Close drains it.
	ch := make(chan BridgeResponse, 1)
	entry := &pendingEntry{ch: ch}
	entry.timer = time.AfterFunc(10*time.Second, func() {})

	b.mu.Lock()
	b.pending["test-id"] = entry
	b.mu.Unlock()

	b.Close()

	// Channel must be closed (receive returns zero value, ok=false).
	select {
	case _, ok := <-ch:
		if ok {
			t.Error("expected channel to be closed")
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("timed out waiting for channel to be closed")
	}
}

// ── Send ─────────────────────────────────────────────────────────────────────

func TestBridgeSend_NotConnected(t *testing.T) {
	b := NewBridge()
	_, err := b.Send(context.Background(), "get_node", []string{"1:1"}, nil)
	if err == nil {
		t.Error("expected error when not connected")
	}
}

func TestBridgeSend_ContextCancelled(t *testing.T) {
	b, _ := setupBridgeWithClient(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, err := b.Send(ctx, "get_node", []string{"1:1"}, nil)
	if err == nil {
		t.Error("expected error for cancelled context")
	}
}

func TestBridgeSend_Success(t *testing.T) {
	b, clientConn := setupBridgeWithClient(t)
	ctx := context.Background()

	// Goroutine: echo request back as a successful response.
	go func() {
		var req BridgeRequest
		if err := wsjson.Read(ctx, clientConn, &req); err != nil {
			return
		}
		resp := BridgeResponse{
			RequestID: req.RequestID,
			Type:      req.Type,
			Data:      map[string]any{"id": "1:1", "name": "Frame 1"},
		}
		wsjson.Write(ctx, clientConn, resp) //nolint:errcheck
	}()

	got, err := b.Send(ctx, "get_node", []string{"1:1"}, nil)
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if got.Data == nil {
		t.Error("expected non-nil data in response")
	}
}

func TestBridgeSend_PluginError(t *testing.T) {
	b, clientConn := setupBridgeWithClient(t)
	ctx := context.Background()

	go func() {
		var req BridgeRequest
		if err := wsjson.Read(ctx, clientConn, &req); err != nil {
			return
		}
		resp := BridgeResponse{
			RequestID: req.RequestID,
			Error:     "node not found",
		}
		wsjson.Write(ctx, clientConn, resp) //nolint:errcheck
	}()

	got, err := b.Send(ctx, "get_node", []string{"9:9"}, nil)
	if err != nil {
		t.Fatalf("unexpected transport error: %v", err)
	}
	if got.Error == "" {
		t.Error("expected error field from plugin")
	}
}

func TestBridgeSend_Timeout(t *testing.T) {
	b, _ := setupBridgeWithClient(t)
	// Don't send any response from the client — bridge should time out.
	// We manipulate the timeout via a very short context rather than waiting 30s.
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := b.Send(ctx, "get_node", []string{"1:1"}, nil)
	if err == nil {
		t.Error("expected timeout error")
	}
}

// ── IsConnected ───────────────────────────────────────────────────────────────

func TestBridgeIsConnected(t *testing.T) {
	b := NewBridge()
	if b.IsConnected() {
		t.Error("should not be connected before any upgrade")
	}

	b2, _ := setupBridgeWithClient(t)
	if !b2.IsConnected() {
		t.Error("should be connected after upgrade")
	}
}

func TestBridgeSessionRegistration(t *testing.T) {
	b := NewBridge()
	connA := &websocket.Conn{}
	connB := &websocket.Conn{}

	b.registerSession(connA, pluginSession{SessionID: "figma:a", FileName: "A"})
	if got := b.ActiveSession(); got != "figma:a" {
		t.Fatalf("active session after first announce = %q, want figma:a", got)
	}

	b.registerSession(connB, pluginSession{SessionID: "figma:b", FileName: "B"})

	if got := b.ActiveSession(); got != "figma:a" {
		t.Fatalf("active session after second announce = %q, want figma:a", got)
	}
	sessions := b.SessionCatalog()
	if len(sessions) != 2 {
		t.Fatalf("session count = %d, want 2", len(sessions))
	}
	if !b.SetActiveSession("figma:a") {
		t.Fatal("expected SetActiveSession to succeed")
	}
	if got := b.ActiveSession(); got != "figma:a" {
		t.Fatalf("active session = %q, want figma:a", got)
	}

	// Re-announcing another session must not steal the explicit active session.
	b.registerSession(connB, pluginSession{SessionID: "figma:b", FileName: "B", PageName: "Page 1"})
	if got := b.ActiveSession(); got != "figma:a" {
		t.Fatalf("active session after re-announce = %q, want figma:a", got)
	}
}

func TestBridgeSetActiveSessionRebuildsIndex(t *testing.T) {
	b := NewBridge()
	connA := &websocket.Conn{}
	connB := &websocket.Conn{}

	b.conns[connA] = pluginSession{SessionID: "figma:a", FileName: "A"}
	b.conns[connB] = pluginSession{SessionID: "figma:b", FileName: "B"}
	b.bySession = map[string]*websocket.Conn{}

	if !b.SetActiveSession("figma:b") {
		t.Fatal("expected SetActiveSession to recover from stale session index")
	}
	if got := b.ActiveSession(); got != "figma:b" {
		t.Fatalf("active session = %q, want figma:b", got)
	}
}

func TestBridgeClientRouteIsSticky(t *testing.T) {
	b := NewBridge()
	connA := &websocket.Conn{}
	connB := &websocket.Conn{}

	b.registerSession(connA, pluginSession{SessionID: "figma:a", FileName: "A"})
	b.registerSession(connB, pluginSession{SessionID: "figma:b", FileName: "B"})

	if !b.SetActiveSessionForClient("stdio:1", "figma:b") {
		t.Fatal("expected client route switch to succeed")
	}
	if got := b.ActiveSessionForClient("stdio:1"); got != "figma:b" {
		t.Fatalf("client route = %q, want figma:b", got)
	}
	if got := b.ActiveSession(); got != "figma:a" {
		t.Fatalf("global active session = %q, want figma:a", got)
	}
	if routes := b.RouteTable(); len(routes) != 1 || routes[0].ClientID != "stdio:1" || routes[0].ActiveSession != "figma:b" {
		t.Fatalf("unexpected route table: %+v", routes)
	}
}

func TestExtractRoutingHints(t *testing.T) {
	params := map[string]interface{}{
		"sessionId": "figma:doc-1",
		"clientId":  "stdio:7",
		"detail":    "compact",
	}
	sessionID, clientID, stripped := extractRoutingHints(params)
	if sessionID != "figma:doc-1" {
		t.Fatalf("sessionID = %q", sessionID)
	}
	if clientID != "stdio:7" {
		t.Fatalf("clientID = %q", clientID)
	}
	if _, ok := stripped["sessionId"]; ok {
		t.Fatal("expected sessionId to be stripped from plugin params")
	}
	if _, ok := stripped["clientId"]; ok {
		t.Fatal("expected clientId to be stripped from plugin params")
	}
	if stripped["detail"] != "compact" {
		t.Fatalf("unexpected stripped params: %+v", stripped)
	}
}
