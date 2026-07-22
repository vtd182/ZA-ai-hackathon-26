package playbooks

import "github.com/mark3labs/mcp-go/server"

// RegisterAll registers all MCP prompts on the server.
func RegisterAll(s *server.MCPServer) {
	addReadDesignStrategy(s)
	addDesignStrategy(s)
	addDesignReferenceStrategy(s)
	addLargeFileRecoveryStrategy(s)
	addSessionTargetingStrategy(s)
	addTextReplacementStrategy(s)
	addAnnotationConversionStrategy(s)
	addSwapOverridesInstances(s)
	addReactionToConnectorStrategy(s)
	addStyleAuditStrategy(s)
	addBulkRenameStrategy(s)
	addDesignTokenGenerationStrategy(s)
	addGenerateColorPalette(s)
	addGenerateTypeScale(s)
	addGenerateComponentVariants(s)
	addCrossSessionDSStrategy(s)
	addIconStrategy(s)
}
