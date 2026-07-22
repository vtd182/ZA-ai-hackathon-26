package playbooks

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func addSessionTargetingStrategy(s *server.MCPServer) {
	s.AddPrompt(mcp.NewPrompt("session_targeting_strategy",
		mcp.WithPromptDescription("Use runtime sessions deliberately when multiple Figma files or plugin instances are connected"),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return mcp.NewGetPromptResult(
			"Use runtime sessions deliberately",
			[]mcp.PromptMessage{
				mcp.NewPromptMessage(
					mcp.RoleUser,
					mcp.NewTextContent(`Use this workflow when more than one Figma file or plugin runtime may be connected.

## Core idea

The runtime can route tool calls by active session.

## Recommended flow

1. Call get_runtime_sessions() to inspect:
   - activeSession
   - connected file/page pairs
   - available session IDs

2. If the user clearly refers to a different file than the active session:
   - call set_runtime_session(sessionId)
   - confirm the new active session through get_runtime_sessions()

3. For a focused read/edit sequence:
   - keep the active session stable
   - avoid mixing work across sessions mid-task

4. Before concluding visual work:
   - call review_canvas_layout() inside the currently active session
   - make sure the reported file/page match the user’s intended target

## Rules

- Do not assume one global Figma world.
- If the user mentions a file or page that does not match the active session, pause and re-target.
- Prefer changing the active session once before a batch of calls instead of bouncing between sessions repeatedly.
`),
				),
			},
		), nil
	})
}
