package core

import "github.com/mark3labs/mcp-go/server"

func registerWriteTools(s *server.MCPServer, runtime *Runtime) {
	registerWriteCreateTools(s, runtime)
	registerWriteModifyTools(s, runtime)
	registerWriteVectorTools(s, runtime)
	registerWriteStyleTools(s, runtime)
	registerWriteVariableTools(s, runtime)
	registerWriteComponentTools(s, runtime)
	registerWritePrototypeTools(s, runtime)
	registerWritePageTools(s, runtime)
	registerWriteIconTools(s, runtime)
}
