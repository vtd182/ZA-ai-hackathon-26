package core

import "github.com/mark3labs/mcp-go/server"

func registerReadTools(s *server.MCPServer, runtime *Runtime) {
	registerReadDocumentTools(s, runtime)
	registerReadStyleTools(s, runtime)
	registerReadExportTools(s, runtime)
	registerGeneratorTools(s, runtime)
	registerReadIconTools(s, runtime)
}
