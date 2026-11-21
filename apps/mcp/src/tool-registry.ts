/**
 * MCP Tool Registry — Registry + Strategy Pattern
 *
 * Each tool is a ToolDefinition (Strategy) with name, description, params, and handler.
 * The registry collects tools and installs them on the MCP server with
 * standardized JSON response formatting and error handling.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodRawShape } from 'zod'

export interface ToolDefinition {
  name: string
  description: string
  params: ZodRawShape
  /** Return raw data — the registry wraps it in JSON + content format */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args type is derived from each tool's zod schema; using `any` keeps the per-tool inference at call sites
  handler: (args: any) => Promise<unknown>
}

export class ToolRegistry {
  private tools: ToolDefinition[] = []

  register(tool: ToolDefinition): void {
    this.tools.push(tool)
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.push(tool)
    }
  }

  installOn(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.params, async (args) => {
        try {
          const result = await tool.handler(args)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            content: [{ type: 'text' as const, text: `${tool.name} failed: ${message}` }],
            isError: true,
          }
        }
      })
    }
  }

  get size(): number {
    return this.tools.length
  }
}
