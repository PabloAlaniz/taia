#!/usr/bin/env npx tsx
/**
 * TAIA MCP Server
 *
 * Exposes TAIA task and agent management as MCP tools,
 * enabling use from Claude Desktop, Cursor, and other MCP clients.
 *
 * Usage:
 *   npx tsx mcp/server.ts
 *
 * Claude Desktop config:
 *   See docs/examples/claude_desktop_config.example.json
 */

import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { initEventListeners } from '@taia/core/events'
import { ToolRegistry } from './tool-registry'
import { taskTools } from './tools/task-tools'
import { agentTools } from './tools/agent-tools'
import { worktreeTools } from './tools/worktree-tools'
import { dependencyTools } from './tools/dependency-tools'
import { workspaceTools } from './tools/workspace-tools'
import { projectTools } from './tools/project-tools'
import { sessionTools } from './tools/session-tools'
import { planningTools } from './tools/planning-tools'
import { subtaskTools } from './tools/subtask-tools'
import { messageTools } from './tools/message-tools'
import { runtimeTargetTools } from './tools/runtime-target-tools'

/** All tool families exposed by the TAIA MCP server. */
const ALL_TOOLS = [
  taskTools,
  agentTools,
  worktreeTools,
  dependencyTools,
  workspaceTools,
  projectTools,
  sessionTools,
  planningTools,
  subtaskTools,
  messageTools,
  runtimeTargetTools,
]

/** Number of tools exposed by the server — used for startup logging. */
export const TOOL_COUNT = ALL_TOOLS.reduce((sum, tools) => sum + tools.length, 0)

/**
 * Build a fully-configured TAIA MCP server instance with all tools registered.
 *
 * Shared by every transport (stdio in this file, HTTP in `http.ts`). HTTP runs
 * stateless, so a fresh server is built per request — keep this side-effect free.
 */
export function createTaiaMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'taia',
      version: '1.0.0',
    },
    {
      capabilities: { tools: {} },
    },
  )

  const registry = new ToolRegistry()
  for (const tools of ALL_TOOLS) {
    registry.registerAll(tools)
  }
  registry.installOn(server)

  return server
}

// --- Start server (stdio transport) ---

async function main() {
  // Register domain event listeners once so MCP-driven task/dependency
  // mutations produce their side effects (activity logging, broadcasting).
  initEventListeners()
  const server = createTaiaMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`TAIA MCP server running on stdio (${TOOL_COUNT} tools)`)
}

// Only start the stdio transport when this file is the entrypoint, so importing
// `createTaiaMcpServer` from other transports (e.g. http.ts) doesn't also spawn
// a stdio server that hijacks stdin/stdout.
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  main().catch((error) => {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  })
}
