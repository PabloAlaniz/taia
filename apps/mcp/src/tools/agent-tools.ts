import type { ToolDefinition } from '../tool-registry'
import { fetchEnrichedAgents } from '@taia/core/services/agent.service'
import { getAllAgents } from '@taia/core/db'

export const listAgentsTool: ToolDefinition = {
  name: 'taia_list_agents',
  description: 'List all agents registered in TAIA with their status',
  params: {},
  handler: async () => {
    try {
      const { agents, source } = await fetchEnrichedAgents(false)
      return {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          type: a.type,
          enabled: a.enabled,
          nextRunIn: a.nextRunIn,
        })),
        source,
      }
    } catch {
      // Fallback to DB-only agents
      const agents = await getAllAgents(true)
      return {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          type: a.type,
          enabled: a.enabled,
        })),
        source: 'database-only',
      }
    }
  },
}

export const agentTools: ToolDefinition[] = [listAgentsTool]
