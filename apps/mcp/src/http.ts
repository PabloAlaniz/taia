#!/usr/bin/env npx tsx
/**
 * TAIA MCP Server — HTTP transport
 *
 * Exposes the same tools as `server.ts` over Streamable HTTP, so the MCP can run
 * as a long-lived service inside the Docker stack (see docker-compose `mcp`
 * service) and be reached over the network by Claude Code and other clients.
 *
 * Runs stateless: a fresh server + transport is created per request and torn
 * down when the response closes. No session affinity required.
 *
 * Usage:
 *   MCP_PORT=13336 npx tsx apps/mcp/src/http.ts
 *
 * Endpoints:
 *   POST /mcp     — JSON-RPC MCP requests (Streamable HTTP)
 *   GET  /health  — liveness probe for Docker healthcheck
 */

import { initEventListeners } from '@taia/core/events'
import { resolveBindHost } from './bind-host'
import { allowedHosts, createHttpApp } from './http-app'
import { TOOL_COUNT } from './server'

// Register domain event listeners (activity logging, broadcasting, worktree
// auto-create) once for this process, so task/dependency mutations triggered
// by MCP tools produce their side effects. The HTTP server builds a fresh MCP
// server per request, so this must live at the process level, not per request.
initEventListeners()

const PORT = Number(process.env.MCP_PORT) || 13336
const HOST = resolveBindHost()

createHttpApp(allowedHosts(PORT)).listen(PORT, HOST, () => {
  console.error(`TAIA MCP server running on http://${HOST}:${PORT}/mcp (${TOOL_COUNT} tools)`)
})
