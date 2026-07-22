package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"za-talk-to-figma/core/controlplane"
	"za-talk-to-figma/core/logging"
)

var leaderLogger = logging.Module("leader")

// Leader owns the WebSocket bridge to the Figma plugin and exposes
// HTTP endpoints for health checks and follower RPC proxying.
//
// Endpoints:
//
//	/ws   — WebSocket upgrade for the Figma plugin
//	/ping — Health check (GET)
//	/rpc  — JSON RPC for follower tool calls (POST)
type Leader struct {
	ip      string
	port    int
	bridge  *Bridge
	server  *http.Server
	version string
	reload  func() error
}

// NewLeader creates a Leader. Call Start() to bind the ip:port.
func NewLeader(ip string, port int, version string) *Leader {
	return &Leader{
		ip:      ip,
		port:    port,
		bridge:  NewBridge(),
		version: version,
		reload:  requestProcessReload,
	}
}

// GetBridge returns the underlying Bridge so Node can use it directly.
func (l *Leader) GetBridge() *Bridge {
	return l.bridge
}

// Start binds the port and begins serving. Returns an error immediately
// if the port is already in use (EADDRINUSE → caller detects another leader).
func (l *Leader) Start() error {
	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", l.ip, l.port))
	if err != nil {
		return err // includes EADDRINUSE
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", l.handleRoot)
	mux.HandleFunc("/ping", l.handlePing)
	mux.HandleFunc("/rpc", l.handleRPC)
	mux.HandleFunc("/runtime-event", l.handleRuntimeEvent)
	mux.HandleFunc("/session", l.handleSession)
	mux.HandleFunc("/sessions", l.handleSessions)
	mux.HandleFunc("/admin", l.handleAdmin)
	mux.HandleFunc("/admin/overview", l.handleAdminOverview)
	mux.HandleFunc("/admin/events", l.handleAdminEvents)
	mux.HandleFunc("/admin/reload", l.handleAdminReload)
	mux.HandleFunc("/ws", l.handleWS)

	srv := &http.Server{Handler: mux}
	l.server = srv

	safeGo("leader.serve", func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			leaderLogger.Error("http serve error", "err", err)
		}
	})

	leaderLogger.Info("listening", "ip", l.ip, "port", l.port)
	return nil
}

func (l *Leader) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	http.Redirect(w, r, "/admin", http.StatusTemporaryRedirect)
}

// Stop shuts down the HTTP server and closes the bridge.
func (l *Leader) Stop() {
	if l.server != nil {
		l.server.Shutdown(context.Background())
		l.server = nil
	}
	l.bridge.Close()
}

// handlePing responds to health checks from followers.
func (l *Leader) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	err := json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"version": l.version,
	})
	if err != nil {
		leaderLogger.Warn("encode ping response failed", "err", err)
	}
}

// handleWS upgrades the connection to WebSocket for the Figma plugin.
func (l *Leader) handleWS(w http.ResponseWriter, r *http.Request) {
	l.bridge.HandleUpgrade(w, r)
}

// handleRPC handles JSON RPC calls from follower processes.
func (l *Leader) handleRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: "failed to read body"})
		return
	}

	var req RPCRequest
	if err := json.Unmarshal(body, &req); err != nil {
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: "invalid JSON"})
		return
	}

	leaderLogger.Debug("rpc received", "tool", req.Tool, "session", req.SessionID, "client", req.ClientID, "nodeIDs", req.NodeIDs, "remoteAddr", r.RemoteAddr)

	if validationErr := ValidateRPC(req.Tool, req.NodeIDs, req.Params); validationErr != "" {
		leaderLogger.Warn("rpc validation error", "tool", req.Tool, "err", validationErr)
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: validationErr, Code: CodeValidation})
		return
	}

	params := req.Params
	if req.SessionID != "" {
		if params == nil {
			params = map[string]interface{}{}
		}
		params["sessionId"] = req.SessionID
	}
	if req.ClientID != "" {
		if params == nil {
			params = map[string]interface{}{}
		}
		params["clientId"] = req.ClientID
	}
	resp, err := l.bridge.Send(r.Context(), req.Tool, req.NodeIDs, params)
	if err != nil {
		rerr := classifyError(err, "")
		leaderLogger.Warn("rpc bridge error", "tool", req.Tool, "code", string(rerr.Code), "err", err)
		l.sendJSON(w, http.StatusOK, RPCResponse{Error: rerr.Message, Code: rerr.Code, Retryable: rerr.Retryable})
		return
	}

	if resp.Error != "" {
		leaderLogger.Debug("rpc plugin error", "tool", req.Tool, "err", resp.Error)
		l.sendJSON(w, http.StatusOK, RPCResponse{Error: resp.Error, Code: CodePluginError})
		return
	}

	l.sendJSON(w, http.StatusOK, RPCResponse{Data: resp.Data})
}

func (l *Leader) handleRuntimeEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var event RuntimeEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: "invalid JSON"})
		return
	}
	if event.Type == "" {
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: "type is required"})
		return
	}
	if err := l.bridge.PublishEvent(r.Context(), event.SessionID, event); err != nil {
		l.sendJSON(w, http.StatusOK, RPCResponse{Error: err.Error()})
		return
	}
	l.sendJSON(w, http.StatusOK, RPCResponse{Data: map[string]any{"ok": true}})
}

func (l *Leader) handleSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SessionID string `json:"sessionId"`
		ClientID  string `json:"clientId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: "invalid JSON"})
		return
	}
	if body.SessionID == "" {
		l.sendJSON(w, http.StatusBadRequest, RPCResponse{Error: "sessionId is required"})
		return
	}
	if ok := l.bridge.SetActiveSessionForClient(body.ClientID, body.SessionID); !ok {
		l.sendJSON(w, http.StatusOK, RPCResponse{Error: "session not found"})
		return
	}
	l.sendJSON(w, http.StatusOK, RPCResponse{Data: map[string]any{"ok": true}})
}

func (l *Leader) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{
		"activeSession": l.bridge.ActiveSession(),
		"sessions":      l.bridge.SessionCatalog(),
	}); err != nil {
		leaderLogger.Warn("encode sessions response failed", "err", err)
	}
}

func (l *Leader) handleAdmin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.WriteString(w, controlplane.HTML())
}

func (l *Leader) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	payload := map[string]any{
		"role":          "leader",
		"version":       l.version,
		"activeSession": l.bridge.ActiveSession(),
		"connected":     l.bridge.IsConnected(),
		"pendingCount":  l.bridge.PendingCount(),
		"sessionCount":  len(l.bridge.SessionCatalog()),
		"sessions":      l.bridge.SessionCatalog(),
		"routes":        l.bridge.RouteTable(),
		"clientCount":   len(l.bridge.RouteTable()),
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		leaderLogger.Warn("encode admin overview failed", "err", err)
	}
}

func (l *Leader) handleAdminEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{
		"events": l.bridge.RecentEvents(40),
	}); err != nil {
		leaderLogger.Warn("encode admin events failed", "err", err)
	}
}

func (l *Leader) handleAdminReload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	l.sendJSON(w, http.StatusOK, RPCResponse{Data: map[string]any{"ok": true, "reloading": true}})
	safeGo("leader.adminReload", func() {
		time.Sleep(120 * time.Millisecond)
		l.bridge.recordEvent(RuntimeEvent{
			Type: "runtime_reload",
			Data: map[string]any{"source": "controlplane"},
		})
		if err := l.reload(); err != nil {
			leaderLogger.Error("runtime reload failed", "err", err)
		}
	})
}

func (l *Leader) sendJSON(w http.ResponseWriter, status int, body RPCResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		leaderLogger.Warn("encode response failed", "err", err)
	}
}
