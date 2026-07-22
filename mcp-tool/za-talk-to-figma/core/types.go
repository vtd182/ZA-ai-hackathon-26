package core

import coreevents "za-talk-to-figma/core/events"

// BridgeRequest is sent from the Go server to the Figma plugin over WebSocket.
type BridgeRequest struct {
	Type      string                 `json:"type"`
	RequestID string                 `json:"requestId"`
	SessionID string                 `json:"sessionId,omitempty"`
	ClientID  string                 `json:"clientId,omitempty"`
	NodeIDs   []string               `json:"nodeIds,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

// BridgeResponse is received from the Figma plugin over WebSocket.
type BridgeResponse struct {
	Type      string      `json:"type"`
	RequestID string      `json:"requestId"`
	SessionID string      `json:"sessionId,omitempty"`
	ClientID  string      `json:"clientId,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
	// Progress fields — sent mid-operation for long-running commands
	Progress       int    `json:"progress,omitempty"`
	Message        string `json:"message,omitempty"`
	FileName       string `json:"fileName,omitempty"`
	PageName       string `json:"pageName,omitempty"`
	SelectionCount int    `json:"selectionCount,omitempty"`
}

// RPCRequest is the wire format for follower → leader /rpc calls.
type RPCRequest struct {
	Tool      string                 `json:"tool"`
	SessionID string                 `json:"sessionId,omitempty"`
	ClientID  string                 `json:"clientId,omitempty"`
	NodeIDs   []string               `json:"nodeIds,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

// RPCResponse is returned by the leader /rpc endpoint. Code/Retryable carry the
// typed error classification across the follower→leader boundary so a follower
// process can reconstruct the same RuntimeError the leader observed.
type RPCResponse struct {
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
	Code      ErrorCode   `json:"code,omitempty"`
	Retryable bool        `json:"retryable,omitempty"`
}

type RuntimeEvent = coreevents.RuntimeEvent
type ObservedRuntimeEvent = coreevents.ObservedEvent
type ClientRoute = coreevents.ClientRoute

// Role represents the current role of this server process.
type Role int

const (
	RoleUnknown  Role = 0
	RoleLeader   Role = 1
	RoleFollower Role = 2
)
