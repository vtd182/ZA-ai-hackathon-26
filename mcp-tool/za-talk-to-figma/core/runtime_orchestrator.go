package core

// Runtime is the top-level execution boundary for MCP capabilities.
// It owns the node transport, capability registry, and execution engine.
type Runtime struct {
	Node     *Node
	Registry *CapabilityRegistry
	Engine   *ExecutionEngine
}

func NewRuntime(node *Node) *Runtime {
	registry := NewCapabilityRegistry()
	return &Runtime{
		Node:     node,
		Registry: registry,
		Engine:   NewExecutionEngine(node, registry),
	}
}
