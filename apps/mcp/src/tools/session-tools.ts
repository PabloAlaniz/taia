import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import {
  listSessions,
  getActiveSessions,
  getSessionDetail,
} from '@taia/core/services/session.service'

export const listSessionsTool: ToolDefinition = {
  name: 'taia_list_sessions',
  description: 'List sessions with optional filters',
  params: {
    agentId: z.string().optional().describe('Filter by agent ID'),
    status: z.enum(['active', 'recent', 'all']).optional().describe('Filter by session status'),
    limit: z.number().optional().describe('Max number of sessions to return'),
  },
  handler: async ({ agentId, status, limit }) => {
    const items = await listSessions({ agentId, status, limit })
    return {
      sessions: items.map((s) => ({
        key: s.key,
        instanceId: s.instanceId,
        agentId: s.agentId,
        agentName: s.agentName,
        status: s.status,
        model: s.model,
        lastActivityAgo: s.lastActivityAgo,
        estimatedCostUsd: s.estimatedCostUsd,
      })),
    }
  },
}

export const getActiveSessionsTool: ToolDefinition = {
  name: 'taia_get_active_sessions',
  description: 'Get all currently active sessions',
  params: {},
  handler: async () => {
    const results = await getActiveSessions()
    return {
      sessions: results.map((s) => ({
        key: s.key,
        agentId: s.agentId,
        agentName: s.agentName,
        status: s.status,
        currentAction: s.currentAction,
        recentTools: s.recentTools,
        messagePreview: s.messagePreview,
      })),
    }
  },
}

export const getSessionTool: ToolDefinition = {
  name: 'taia_get_session',
  description: 'Get detailed info for a specific session',
  params: {
    sessionKey: z.string().describe('The session key'),
    instanceId: z
      .string()
      .optional()
      .describe('Runtime instance that owns the session (from taia_list_sessions)'),
    limit: z.number().optional().describe('Max number of messages to include'),
  },
  handler: async ({ sessionKey, instanceId, limit }) => {
    const session = await getSessionDetail(sessionKey, { instanceId, limit })
    if (!session) throw new Error(`Session ${sessionKey} not found`)
    return session
  },
}

export const sessionTools: ToolDefinition[] = [
  listSessionsTool,
  getActiveSessionsTool,
  getSessionTool,
]
