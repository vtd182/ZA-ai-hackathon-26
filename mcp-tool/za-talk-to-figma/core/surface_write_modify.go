package core

import "github.com/mark3labs/mcp-go/server"

func registerWriteModifyTools(s *server.MCPServer, runtime *Runtime) {
	registerWriteContentTools(s, runtime)
	registerWriteGeometryTools(s, runtime)
	registerWriteLayoutTools(s, runtime)
}
