package events

import "time"

type RuntimeEvent struct {
	Type      string      `json:"type"`
	SessionID string      `json:"sessionId,omitempty"`
	ClientID  string      `json:"clientId,omitempty"`
	RequestID string      `json:"requestId,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

type ObservedEvent struct {
	Type      string      `json:"type"`
	SessionID string      `json:"sessionId,omitempty"`
	ClientID  string      `json:"clientId,omitempty"`
	RequestID string      `json:"requestId,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data,omitempty"`
}

type ClientRoute struct {
	ClientID      string `json:"clientId"`
	ActiveSession string `json:"activeSession"`
}
