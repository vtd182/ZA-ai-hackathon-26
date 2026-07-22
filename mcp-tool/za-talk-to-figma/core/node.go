package core

import (
	"context"
	"fmt"
	"os"
	"sync"

	"za-talk-to-figma/core/logging"
)

var nodeLogger = logging.Module("node")

// Node dynamically routes MCP tool calls to either the Leader bridge
// or the Follower HTTP proxy, depending on the current role.
type Node struct {
	mu       sync.RWMutex
	role     Role
	ip       string
	port     int
	clientID string
	leader   *Leader
	follower *Follower
	version  string
}

// NewNode creates a Node in the Unknown role.
func NewNode(ip string, port int, version string) *Node {
	return &Node{
		ip:       ip,
		port:     port,
		clientID: fmt.Sprintf("stdio:%d", os.Getpid()),
		role:     RoleUnknown,
		version:  version,
		follower: NewFollower(fmt.Sprintf("http://%s:%d", ip, port)),
	}
}

// Role returns the current role.
func (n *Node) Role() Role {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.role
}

// RoleName returns a human-readable role string.
func (n *Node) RoleName() string {
	switch n.Role() {
	case RoleLeader:
		return "LEADER"
	case RoleFollower:
		return "FOLLOWER"
	default:
		return "UNKNOWN"
	}
}

// Send routes a request to the appropriate backend.
func (n *Node) Send(ctx context.Context, tool string, nodeIDs []string, params map[string]interface{}) (BridgeResponse, error) {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	n.mu.RUnlock()

	// Normalize hyphen-format node IDs that LLMs sometimes produce.
	for i, id := range nodeIDs {
		nodeIDs[i] = NormalizeNodeID(id)
	}
	// Normalize common param keys that contain node IDs.
	if params == nil {
		params = map[string]interface{}{}
	}
	for _, key := range []string{"nodeId", "parentId"} {
		if v, ok := params[key].(string); ok {
			params[key] = NormalizeNodeID(v)
		}
	}
	if _, ok := params["clientId"]; !ok && n.clientID != "" {
		params["clientId"] = n.clientID
	}

	nodeLogger.Debug("routing tool call", "tool", tool, "role", n.RoleName(), "nodeIDs", nodeIDs)

	if role == RoleLeader && leader != nil {
		return leader.GetBridge().Send(ctx, tool, nodeIDs, params)
	}
	return n.follower.Send(ctx, tool, nodeIDs, params)
}

func (n *Node) PublishRuntimeEvent(ctx context.Context, event RuntimeEvent) error {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	n.mu.RUnlock()
	if event.ClientID == "" {
		event.ClientID = n.clientID
	}
	if role == RoleLeader && leader != nil {
		return leader.GetBridge().PublishEvent(ctx, event.SessionID, event)
	}
	return n.follower.PublishRuntimeEvent(ctx, event)
}

func (n *Node) ClientID() string {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.clientID
}

func (n *Node) ActiveSession() string {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	follower := n.follower
	n.mu.RUnlock()
	if role == RoleLeader && leader != nil {
		return leader.GetBridge().ActiveSession()
	}
	if role == RoleFollower && follower != nil {
		active, _, err := follower.GetRuntimeSessions(context.Background())
		if err == nil {
			return active
		}
	}
	return ""
}

func (n *Node) SessionCatalog() []pluginSession {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	follower := n.follower
	n.mu.RUnlock()
	if role == RoleLeader && leader != nil {
		return leader.GetBridge().SessionCatalog()
	}
	if role == RoleFollower && follower != nil {
		_, sessions, err := follower.GetRuntimeSessions(context.Background())
		if err == nil {
			return sessions
		}
	}
	return nil
}

func (n *Node) SetActiveSession(ctx context.Context, sessionID string) error {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	clientID := n.clientID
	n.mu.RUnlock()
	if role == RoleLeader && leader != nil {
		if ok := leader.GetBridge().SetActiveSessionForClient(clientID, sessionID); !ok {
			return fmt.Errorf("session not found")
		}
		return nil
	}
	return n.follower.SetActiveSession(ctx, sessionID, clientID)
}

// RuntimeHealth is a point-in-time snapshot of runtime state, usable for
// diagnostics even when the Figma plugin is disconnected.
type RuntimeHealth struct {
	Role            string          `json:"role"`
	Version         string          `json:"version"`
	ClientID        string          `json:"clientId"`
	LogLevel        string          `json:"logLevel"`
	PluginConnected bool            `json:"pluginConnected"`
	LeaderReachable bool            `json:"leaderReachable"`
	ActiveSession   string          `json:"activeSession"`
	SessionCount    int             `json:"sessionCount"`
	PendingCount    int             `json:"pendingCount"`
	Sessions        []pluginSession `json:"sessions"`
	Routes          []ClientRoute   `json:"routes"`
}

// Health returns a runtime health snapshot. In leader role it reads directly
// from the bridge; in follower role it queries the leader's overview endpoint
// and degrades gracefully (LeaderReachable=false) when the leader is unreachable.
func (n *Node) Health(ctx context.Context) RuntimeHealth {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	follower := n.follower
	n.mu.RUnlock()

	health := RuntimeHealth{
		Role:     n.RoleName(),
		Version:  n.version,
		ClientID: n.ClientID(),
		LogLevel: logging.LevelFromEnv().String(),
	}

	if role == RoleLeader && leader != nil {
		b := leader.GetBridge()
		sessions := b.SessionCatalog()
		routes := b.RouteTable()
		health.PluginConnected = b.IsConnected()
		health.LeaderReachable = true
		health.ActiveSession = b.ActiveSession()
		health.SessionCount = len(sessions)
		health.PendingCount = b.PendingCount()
		health.Sessions = sessions
		health.Routes = routes
		return health
	}

	if role == RoleFollower && follower != nil {
		overview, err := follower.GetOverview(ctx)
		if err != nil {
			health.LeaderReachable = false
			return health
		}
		health.LeaderReachable = true
		if connected, ok := overview["connected"].(bool); ok {
			health.PluginConnected = connected
		}
		if active, ok := overview["activeSession"].(string); ok {
			health.ActiveSession = active
		}
		if pending, ok := overview["pendingCount"].(float64); ok {
			health.PendingCount = int(pending)
		}
		health.Sessions = n.SessionCatalog()
		health.SessionCount = len(health.Sessions)
		return health
	}

	return health
}

// RecentEvents returns the runtime event stream (execution reports, errors,
// session changes). Events are centralized on the leader; a follower fetches
// them over HTTP.
func (n *Node) RecentEvents(ctx context.Context, limit int) ([]ObservedRuntimeEvent, error) {
	n.mu.RLock()
	role := n.role
	leader := n.leader
	follower := n.follower
	n.mu.RUnlock()

	if role == RoleLeader && leader != nil {
		return leader.GetBridge().RecentEvents(limit), nil
	}
	if role == RoleFollower && follower != nil {
		events, err := follower.GetRecentEvents(ctx)
		if err != nil {
			return nil, err
		}
		if limit > 0 && limit < len(events) {
			events = events[len(events)-limit:]
		}
		return events, nil
	}
	return nil, nil
}

// BecomeLeader attempts to bind the port and transition to Leader role.
// Returns an error if the port is already in use.
func (n *Node) BecomeLeader() error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.role == RoleLeader {
		return nil
	}

	leader := NewLeader(n.ip, n.port, n.version)
	if err := leader.Start(); err != nil {
		return err
	}

	n.leader = leader
	n.role = RoleLeader
	nodeLogger.Info("became LEADER")
	return nil
}

// BecomeFollower transitions to Follower role, stopping the leader if running.
func (n *Node) BecomeFollower() {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.role == RoleFollower {
		return
	}

	if n.leader != nil {
		n.leader.Stop()
		n.leader = nil
	}

	n.role = RoleFollower
	nodeLogger.Info("became FOLLOWER")
}

// Stop shuts down the node regardless of role.
func (n *Node) Stop() {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.leader != nil {
		n.leader.Stop()
		n.leader = nil
	}
	n.role = RoleUnknown
}
