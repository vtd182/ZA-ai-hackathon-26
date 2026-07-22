package core

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"za-talk-to-figma/core/logging"
)

var followerLogger = logging.Module("follower")

// Follower proxies MCP tool calls to the leader via HTTP /rpc.
type Follower struct {
	leaderURL string
	client    *http.Client
}

// NewFollower creates a Follower pointed at the given leader base URL.
func NewFollower(leaderURL string) *Follower {
	return &Follower{
		leaderURL: leaderURL,
		client: &http.Client{
			// 35s > 30s bridge timeout — gives the leader time to time out first
			Timeout: 35 * time.Second,
		},
	}
}

// Send proxies a tool call to the leader.
func (f *Follower) Send(ctx context.Context, tool string, nodeIDs []string, params map[string]interface{}) (BridgeResponse, error) {
	sessionID, clientID, params := extractRoutingHints(params)
	followerLogger.Debug("proxying tool call to leader", "tool", tool, "client", clientID, "nodeIDs", nodeIDs, "paramKeys", requestParamKeys(params), "leader", f.leaderURL)
	start := time.Now()

	rpcReq := RPCRequest{
		Tool:      tool,
		SessionID: sessionID,
		ClientID:  clientID,
		NodeIDs:   nodeIDs,
		Params:    params,
	}

	body, err := json.Marshal(rpcReq)
	if err != nil {
		return BridgeResponse{}, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.leaderURL+"/rpc", bytes.NewReader(body))
	if err != nil {
		return BridgeResponse{}, fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := f.client.Do(req)
	if err != nil {
		followerLogger.Warn("proxy rpc call failed", "tool", tool, "err", err)
		return BridgeResponse{}, fmt.Errorf("rpc call: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return BridgeResponse{}, fmt.Errorf("read response: %w", err)
	}

	var rpcResp RPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return BridgeResponse{}, fmt.Errorf("unmarshal: %w", err)
	}

	if rpcResp.Error != "" {
		followerLogger.Debug("proxy returned error from leader", "tool", tool, "code", string(rpcResp.Code), "durationMs", time.Since(start).Milliseconds(), "err", rpcResp.Error)
		// A plugin-domain error travels back as resp.Error (err == nil). Any other
		// classified failure (timeout, not-connected, transport) is reconstructed
		// as a typed error so the follower's render layer classifies it identically
		// to the leader.
		if rpcResp.Code != "" && rpcResp.Code != CodePluginError {
			return BridgeResponse{}, newRuntimeError(rpcResp.Code, rpcResp.Error, rpcResp.Retryable, nil)
		}
		return BridgeResponse{Error: rpcResp.Error}, nil
	}

	followerLogger.Debug("proxy ok", "tool", tool, "durationMs", time.Since(start).Milliseconds())
	return BridgeResponse{
		Type:      tool,
		SessionID: sessionID,
		ClientID:  clientID,
		Data:      rpcResp.Data,
	}, nil
}

func (f *Follower) PublishRuntimeEvent(ctx context.Context, event RuntimeEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.leaderURL+"/runtime-event", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("new event request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := f.client.Do(req)
	if err != nil {
		return fmt.Errorf("runtime event call: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("runtime event status: %d", resp.StatusCode)
	}
	return nil
}

func (f *Follower) GetRuntimeSessions(ctx context.Context) (string, []pluginSession, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.leaderURL+"/sessions", nil)
	if err != nil {
		return "", nil, fmt.Errorf("new sessions request: %w", err)
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("sessions call: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", nil, fmt.Errorf("sessions status: %d", resp.StatusCode)
	}
	var payload struct {
		ActiveSession string          `json:"activeSession"`
		Sessions      []pluginSession `json:"sessions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", nil, fmt.Errorf("decode sessions: %w", err)
	}
	return payload.ActiveSession, payload.Sessions, nil
}

func (f *Follower) SetActiveSession(ctx context.Context, sessionID, clientID string) error {
	body, err := json.Marshal(map[string]any{"sessionId": sessionID, "clientId": clientID})
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.leaderURL+"/session", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("new session request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := f.client.Do(req)
	if err != nil {
		return fmt.Errorf("session call: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("session status: %d", resp.StatusCode)
	}
	var rpcResp RPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err == nil && rpcResp.Error != "" {
		return errors.New(rpcResp.Error)
	}
	return nil
}

// GetOverview fetches the leader's runtime overview (connection state, pending
// count, sessions, routes) so a follower can answer health queries.
func (f *Follower) GetOverview(ctx context.Context) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.leaderURL+"/admin/overview", nil)
	if err != nil {
		return nil, fmt.Errorf("new overview request: %w", err)
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("overview call: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("overview status: %d", resp.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode overview: %w", err)
	}
	return payload, nil
}

// GetRecentEvents fetches the leader's recent runtime event stream.
func (f *Follower) GetRecentEvents(ctx context.Context) ([]ObservedRuntimeEvent, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.leaderURL+"/admin/events", nil)
	if err != nil {
		return nil, fmt.Errorf("new events request: %w", err)
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("events call: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("events status: %d", resp.StatusCode)
	}
	var payload struct {
		Events []ObservedRuntimeEvent `json:"events"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode events: %w", err)
	}
	return payload.Events, nil
}

// Ping checks if the leader is alive. Returns true if healthy.
func (f *Follower) Ping(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.leaderURL+"/ping", nil)
	if err != nil {
		followerLogger.Warn("ping request build failed", "err", err)
		return false
	}

	resp, err := f.client.Do(req)
	if err != nil {
		followerLogger.Debug("ping failed", "leader", f.leaderURL, "err", err)
		return false
	}
	resp.Body.Close()
	ok := resp.StatusCode == http.StatusOK
	followerLogger.Debug("ping result", "leader", f.leaderURL, "status", resp.StatusCode, "healthy", ok)
	return ok
}
