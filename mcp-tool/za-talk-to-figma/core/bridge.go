package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	coreevents "za-talk-to-figma/core/events"
	"za-talk-to-figma/core/logging"
)

var bridgeLogger = logging.Module("bridge")

type requestPolicy struct {
	timeout time.Duration
}

func requestPolicyFor(tool string) requestPolicy {
	switch tool {
	case "get_document":
		return requestPolicy{timeout: 60 * time.Second}
	case "get_design_context", "get_node", "get_node_context", "get_nodes_info",
		"get_styles", "get_variable_defs", "get_local_components",
		"search_nodes", "scan_nodes_by_types", "scan_text_nodes", "get_fonts":
		return requestPolicy{timeout: 45 * time.Second}
	// SVG parsing can be CPU-intensive in Figma's JS VM; give it more headroom.
	case "import_svg", "import_component_by_key":
		return requestPolicy{timeout: 60 * time.Second}
	default:
		return requestPolicy{timeout: 30 * time.Second}
	}
}

func requestParamKeys(params map[string]interface{}) []string {
	if len(params) == 0 {
		return nil
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// pendingEntry holds the response channel and inactivity timer for an in-flight request.
type pendingEntry struct {
	ch    chan BridgeResponse
	timer *time.Timer
	once  sync.Once // guards channel close/send — prevents panic on concurrent timeout + response
}

type pluginSession struct {
	SessionID      string `json:"sessionId"`
	FileName       string `json:"fileName"`
	PageName       string `json:"pageName"`
	SelectionCount int    `json:"selectionCount"`
}

// Bridge manages the single WebSocket connection from the Figma plugin
// and matches responses to pending requests via request IDs.
type Bridge struct {
	mu             sync.RWMutex
	wmu            sync.Mutex // serialises concurrent WebSocket writes (coder/websocket does not support concurrent writes)
	conn           *websocket.Conn
	conns          map[*websocket.Conn]pluginSession
	bySession      map[string]*websocket.Conn
	activeSession  string
	activeByClient map[string]string
	pending        map[string]*pendingEntry
	eventBuffer    *coreevents.Buffer
	counter        atomic.Int64
}

// NewBridge creates a ready-to-use Bridge.
func NewBridge() *Bridge {
	return &Bridge{
		conns:          make(map[*websocket.Conn]pluginSession),
		bySession:      make(map[string]*websocket.Conn),
		activeByClient: make(map[string]string),
		pending:        make(map[string]*pendingEntry),
		eventBuffer:    coreevents.NewBuffer(120),
	}
}

// HandleUpgrade upgrades an HTTP request to a WebSocket connection.
// Only one plugin connection is maintained at a time; a new connection
// replaces the old one (same behaviour as the TypeScript version).
func (b *Bridge) HandleUpgrade(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // skip Origin check — plugin connects via Figma's sandbox
	})
	if err != nil {
		bridgeLogger.Warn("websocket upgrade failed", "err", err)
		return
	}

	// Raise the read limit to 100 MB — Figma documents can be large.
	// Default is 32 KiB which causes "read limited at 32769 bytes" disconnects.
	conn.SetReadLimit(100 * 1024 * 1024)

	b.mu.Lock()
	b.conn = conn
	b.conns[conn] = pluginSession{}
	b.mu.Unlock()

	bridgeLogger.Info("plugin connected", "remoteAddr", r.RemoteAddr)
	go b.readLoop(conn)
}

// readLoop reads messages from the plugin and resolves pending requests.
func (b *Bridge) readLoop(conn *websocket.Conn) {
	// Outermost guard: a panic decoding a malformed plugin message must not crash
	// the process. Registered first so it runs last — it also covers the cleanup
	// defer below.
	defer recoverPanic("bridge.readLoop")
	defer func() {
		shouldBroadcast := false
		b.mu.Lock()
		if b.conn == conn {
			b.conn = nil
		}
		if session, ok := b.conns[conn]; ok {
			if session.SessionID != "" {
				delete(b.bySession, session.SessionID)
				if b.activeSession == session.SessionID {
					b.activeSession = ""
				}
				for clientID, active := range b.activeByClient {
					if active == session.SessionID {
						delete(b.activeByClient, clientID)
					}
				}
				shouldBroadcast = true
			}
			delete(b.conns, conn)
		}
		b.mu.Unlock()
		if shouldBroadcast {
			b.broadcastSessionCatalog(context.Background())
		}
		bridgeLogger.Info("plugin disconnected")
	}()

	ctx := context.Background()
	for {
		var resp BridgeResponse
		if err := wsjson.Read(ctx, conn, &resp); err != nil {
			if !errors.Is(err, context.Canceled) {
				bridgeLogger.Warn("websocket read error", "err", err)
			}
			return
		}

		if resp.Type == "session_announce" {
			b.registerSession(conn, pluginSession{
				SessionID:      resp.SessionID,
				FileName:       resp.FileName,
				PageName:       resp.PageName,
				SelectionCount: resp.SelectionCount,
			})
			continue
		}
		if resp.Type == "session_request_catalog" {
			b.replySessionCatalog(ctx, conn)
			continue
		}
		if resp.Type == "session_switch" {
			if resp.SessionID != "" {
				if ok := b.SetActiveSession(resp.SessionID); !ok {
					bridgeLogger.Warn("session switch failed: session not found", "session", resp.SessionID)
				}
			}
			continue
		}

		// Handle progress updates — extend timeout, do not resolve.
		if resp.Progress > 0 && resp.RequestID != "" {
			b.mu.RLock()
			entry, ok := b.pending[resp.RequestID]
			b.mu.RUnlock()
			if ok {
				// Stop before Reset to avoid the AfterFunc firing during Reset.
				entry.timer.Stop()
				entry.timer.Reset(60 * time.Second)
				bridgeLogger.Debug("progress update", "requestId", resp.RequestID, "progress", resp.Progress, "message", resp.Message)
			} else {
				bridgeLogger.Debug("progress update for unknown request (already resolved or timed out)", "requestId", resp.RequestID, "progress", resp.Progress, "message", resp.Message)
			}
			continue
		}

		if resp.RequestID == "" {
			bridgeLogger.Debug("received message with empty requestID — ignored")
			continue
		}

		b.mu.Lock()
		entry, ok := b.pending[resp.RequestID]
		if ok {
			delete(b.pending, resp.RequestID)
		}
		b.mu.Unlock()

		if ok {
			if resp.Error != "" {
				bridgeLogger.Debug("response received with error", "requestId", resp.RequestID, "err", resp.Error)
			} else {
				bridgeLogger.Debug("response received", "requestId", resp.RequestID)
			}
			entry.timer.Stop()
			// Use once to prevent sending on a channel already closed by timeout.
			entry.once.Do(func() { entry.ch <- resp })
		} else {
			bridgeLogger.Debug("response received but no pending entry (timed out?)", "requestId", resp.RequestID)
		}
	}
}

func (b *Bridge) registerSession(conn *websocket.Conn, session pluginSession) {
	if session.SessionID == "" {
		return
	}
	b.mu.Lock()
	old := b.conns[conn]
	if old.SessionID != "" && old.SessionID != session.SessionID {
		delete(b.bySession, old.SessionID)
	}
	b.conns[conn] = session
	b.bySession[session.SessionID] = conn
	switch {
	case b.activeSession == "":
		b.activeSession = session.SessionID
	case old.SessionID != "" && b.activeSession == old.SessionID && old.SessionID != session.SessionID:
		b.activeSession = session.SessionID
	default:
		if _, ok := b.bySession[b.activeSession]; !ok {
			b.activeSession = session.SessionID
		}
	}
	b.conn = conn
	b.mu.Unlock()
	bridgeLogger.Info("session announced", "session", session.SessionID, "file", session.FileName, "page", session.PageName, "selection", session.SelectionCount)
	b.recordEvent(RuntimeEvent{
		Type:      "session_announce",
		SessionID: session.SessionID,
		Data: map[string]any{
			"fileName":       session.FileName,
			"pageName":       session.PageName,
			"selectionCount": session.SelectionCount,
		},
	})
	b.broadcastSessionCatalog(context.Background())
}

func (b *Bridge) rebuildSessionIndexLocked() {
	rebuilt := make(map[string]*websocket.Conn, len(b.conns))
	for conn, session := range b.conns {
		if session.SessionID == "" {
			continue
		}
		rebuilt[session.SessionID] = conn
	}
	b.bySession = rebuilt
}

func (b *Bridge) ActiveSession() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.activeSession
}

func (b *Bridge) ActiveSessionForClient(clientID string) string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if clientID != "" {
		if active := b.activeByClient[clientID]; active != "" {
			return active
		}
	}
	return b.activeSession
}

func (b *Bridge) SetActiveSession(sessionID string) bool {
	return b.SetActiveSessionForClient("", sessionID)
}

func (b *Bridge) SetActiveSessionForClient(clientID, sessionID string) bool {
	b.mu.Lock()
	if sessionID == "" {
		b.mu.Unlock()
		return false
	}
	if _, ok := b.bySession[sessionID]; !ok {
		b.rebuildSessionIndexLocked()
		if _, ok := b.bySession[sessionID]; !ok {
			b.mu.Unlock()
			return false
		}
	}
	if clientID == "" {
		b.activeSession = sessionID
	} else {
		b.activeByClient[clientID] = sessionID
		if b.activeSession == "" {
			b.activeSession = sessionID
		}
	}
	b.mu.Unlock()
	b.recordEvent(RuntimeEvent{
		Type:      "session_switch",
		SessionID: sessionID,
		ClientID:  clientID,
		Data:      map[string]any{"activeSession": sessionID, "clientId": clientID},
	})
	b.broadcastSessionCatalog(context.Background())
	return true
}

func (b *Bridge) SessionCatalog() []pluginSession {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]pluginSession, 0, len(b.conns))
	for _, session := range b.conns {
		if session.SessionID == "" {
			continue
		}
		out = append(out, session)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].SessionID < out[j].SessionID
	})
	return out
}

func (b *Bridge) PendingCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.pending)
}

func (b *Bridge) RecentEvents(limit int) []ObservedRuntimeEvent {
	return b.eventBuffer.Recent(limit)
}

func (b *Bridge) RouteTable() []ClientRoute {
	b.mu.RLock()
	defer b.mu.RUnlock()
	routes := make([]ClientRoute, 0, len(b.activeByClient))
	for clientID, activeSession := range b.activeByClient {
		routes = append(routes, ClientRoute{ClientID: clientID, ActiveSession: activeSession})
	}
	sort.Slice(routes, func(i, j int) bool {
		return routes[i].ClientID < routes[j].ClientID
	})
	return routes
}

func (b *Bridge) sessionCatalogPayload() map[string]any {
	sessions := b.SessionCatalog()
	return map[string]any{
		"activeSession": b.ActiveSession(),
		"sessions":      sessions,
		"count":         len(sessions),
	}
}

func (b *Bridge) snapshotConns() []*websocket.Conn {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]*websocket.Conn, 0, len(b.conns))
	for conn := range b.conns {
		out = append(out, conn)
	}
	return out
}

func (b *Bridge) replySessionCatalog(ctx context.Context, conn *websocket.Conn) {
	event := RuntimeEvent{
		Type: "session_catalog",
		Data: b.sessionCatalogPayload(),
	}
	b.wmu.Lock()
	err := safeWSJSONWrite(ctx, conn, event)
	b.wmu.Unlock()
	if err != nil {
		bridgeLogger.Warn("session catalog reply failed", "err", err)
	}
}

func (b *Bridge) broadcastSessionCatalog(ctx context.Context) {
	event := RuntimeEvent{
		Type: "session_catalog",
		Data: b.sessionCatalogPayload(),
	}
	for _, conn := range b.snapshotConns() {
		b.wmu.Lock()
		err := safeWSJSONWrite(ctx, conn, event)
		b.wmu.Unlock()
		if err != nil {
			bridgeLogger.Warn("session catalog broadcast failed", "err", err)
		}
	}
}

func safeWSJSONWrite(ctx context.Context, conn *websocket.Conn, payload interface{}) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic while writing websocket payload: %v", r)
		}
	}()
	return wsjson.Write(ctx, conn, payload)
}

// Send sends a request to the plugin and waits for the response.
func (b *Bridge) Send(ctx context.Context, requestType string, nodeIDs []string, params map[string]interface{}) (BridgeResponse, error) {
	sessionID, clientID, params := extractRoutingHints(params)
	conn := b.resolveConn(sessionID, clientID)

	if conn == nil {
		return BridgeResponse{}, errPluginNotConnected()
	}

	requestID := b.nextID()
	req := BridgeRequest{
		Type:      requestType,
		RequestID: requestID,
		SessionID: sessionID,
		ClientID:  clientID,
		NodeIDs:   nodeIDs,
		Params:    params,
	}

	ch := make(chan BridgeResponse, 1)
	entry := &pendingEntry{ch: ch}

	// Register before sending to avoid a race where the response
	// arrives before we store the channel.
	timeout := requestPolicyFor(requestType).timeout
	entry.timer = time.AfterFunc(timeout, func() {
		// AfterFunc runs the callback in its own goroutine — guard it.
		defer recoverPanic("bridge.timeout")
		bridgeLogger.Warn("request timed out", "requestId", requestID, "tool", requestType, "timeout", timeout.String())
		b.mu.Lock()
		delete(b.pending, requestID)
		b.mu.Unlock()
		// Use once to prevent closing a channel already consumed by the read goroutine.
		entry.once.Do(func() { close(ch) })
	})

	b.mu.Lock()
	b.pending[requestID] = entry
	b.mu.Unlock()

	bridgeLogger.Debug("sending request",
		"requestId", requestID,
		"tool", requestType,
		"session", sessionID,
		"nodeCount", len(nodeIDs),
		"paramKeys", requestParamKeys(params),
	)
	start := time.Now()

	b.wmu.Lock()
	writeErr := wsjson.Write(ctx, conn, req)
	b.wmu.Unlock()
	if writeErr != nil {
		entry.timer.Stop()
		b.mu.Lock()
		delete(b.pending, requestID)
		b.mu.Unlock()
		bridgeLogger.Warn("request write failed", "requestId", requestID, "tool", requestType, "err", writeErr)
		return BridgeResponse{}, fmt.Errorf("send: %w", writeErr)
	}

	select {
	case resp, ok := <-ch:
		if !ok {
			return BridgeResponse{}, errRequestTimeout(nil)
		}
		bridgeLogger.Debug("request completed", "requestId", requestID, "tool", requestType, "durationMs", time.Since(start).Milliseconds())
		return resp, nil
	case <-ctx.Done():
		entry.timer.Stop()
		b.mu.Lock()
		delete(b.pending, requestID)
		b.mu.Unlock()
		bridgeLogger.Debug("request context cancelled", "requestId", requestID, "tool", requestType, "err", ctx.Err())
		return BridgeResponse{}, ctx.Err()
	}
}

func (b *Bridge) resolveConn(sessionID, clientID string) *websocket.Conn {
	b.mu.RLock()
	if sessionID != "" {
		if conn, ok := b.bySession[sessionID]; ok {
			b.mu.RUnlock()
			return conn
		}
	}
	if clientID != "" {
		if active := b.activeByClient[clientID]; active != "" {
			if conn, ok := b.bySession[active]; ok {
				b.mu.RUnlock()
				return conn
			}
		}
	}
	if b.activeSession != "" {
		if conn, ok := b.bySession[b.activeSession]; ok {
			b.mu.RUnlock()
			return conn
		}
	}
	conn := b.conn
	b.mu.RUnlock()
	if conn != nil {
		return conn
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	b.rebuildSessionIndexLocked()
	if sessionID != "" {
		if rebuiltConn, ok := b.bySession[sessionID]; ok {
			return rebuiltConn
		}
	}
	if clientID != "" {
		if active := b.activeByClient[clientID]; active != "" {
			if rebuiltConn, ok := b.bySession[active]; ok {
				return rebuiltConn
			}
		}
	}
	if b.activeSession != "" {
		if rebuiltConn, ok := b.bySession[b.activeSession]; ok {
			return rebuiltConn
		}
	}
	return b.conn
}

func extractRoutingHints(params map[string]interface{}) (string, string, map[string]interface{}) {
	if len(params) == 0 {
		return "", "", params
	}
	sessionID, _ := params["sessionId"].(string)
	clientID, _ := params["clientId"].(string)
	if sessionID == "" && clientID == "" {
		return "", "", params
	}
	cloned := cloneParams(params)
	delete(cloned, "sessionId")
	delete(cloned, "clientId")
	return sessionID, clientID, cloned
}

func (b *Bridge) PublishEvent(ctx context.Context, sessionID string, event RuntimeEvent) error {
	if event.Type != "session_catalog" {
		b.recordEvent(event)
	}
	conn := b.resolveConn(sessionID, event.ClientID)
	if conn == nil {
		return errPluginNotConnected()
	}
	b.wmu.Lock()
	err := wsjson.Write(ctx, conn, event)
	b.wmu.Unlock()
	if err != nil {
		return fmt.Errorf("publish event: %w", err)
	}
	return nil
}

func (b *Bridge) recordEvent(event RuntimeEvent) {
	b.eventBuffer.Add(event)
}

// Close shuts down the bridge, rejecting all pending requests.
func (b *Bridge) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()

	for id, entry := range b.pending {
		entry.timer.Stop()
		entry.once.Do(func() { close(entry.ch) })
		delete(b.pending, id)
	}

	if b.conn != nil {
		if err := b.conn.Close(websocket.StatusNormalClosure, "bridge closed"); err != nil {
			bridgeLogger.Warn("close connection failed", "err", err)
		}
		b.conn = nil
	}
}

// nextID generates a request ID in the format req-HHMMSS-N.
func (b *Bridge) nextID() string {
	n := b.counter.Add(1)
	now := time.Now()
	return fmt.Sprintf("req-%02d%02d%02d-%d",
		now.Hour(), now.Minute(), now.Second(), n)
}

// IsConnected reports whether the plugin is currently connected.
func (b *Bridge) IsConnected() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.conn != nil
}

// MarshalJSON is used when logging — avoid printing full conn object.
func (b *Bridge) MarshalJSON() ([]byte, error) {
	b.mu.RLock()
	connected := b.conn != nil
	pending := len(b.pending)
	b.mu.RUnlock()
	return json.Marshal(map[string]interface{}{
		"connected": connected,
		"pending":   pending,
	})
}
