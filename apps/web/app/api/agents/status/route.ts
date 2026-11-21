import { NextResponse } from 'next/server'
import { getAllAgents } from '@taia/core/db'
import { getAgentSessions, getNextHeartbeat } from '@taia/core/agent-runtime'

export const dynamic = 'force-dynamic'

interface AgentStatus {
  id: string
  name: string
  role: string
  avatar: string
  status: 'live' | 'idle' | 'offline'
  sessionKey?: string
  sessionId?: string
  lastActivity?: number
  lastActivityAgo?: string
  model?: string
  totalTokens?: number
  nextRunAtMs?: number
  nextRunIn?: string
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export async function GET() {
  try {
    const now = Date.now()
    // live = activity in last 3 minutes (agents can take time between tool calls)
    // idle = activity in last 15 minutes
    const LIVE_THRESHOLD = 3 * 60 * 1000 // 3 minutes = live
    const IDLE_THRESHOLD = 15 * 60 * 1000 // 15 minutes = idle

    // Get agents from DB
    const dbAgents = await getAllAgents(true)

    // Build status for all DB agents
    const agentStatuses: AgentStatus[] = []
    for (const agent of dbAgents) {
      const sessions = await getAgentSessions(agent.id)

      // Get most recent session
      const latestSession = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]

      let status: 'live' | 'idle' | 'offline' = 'offline'

      if (latestSession) {
        const timeSinceUpdate = now - latestSession.updatedAt

        if (timeSinceUpdate < LIVE_THRESHOLD) {
          status = 'live'
        } else if (timeSinceUpdate < IDLE_THRESHOLD) {
          status = 'idle'
        }
      }

      // Get next heartbeat info from agent config
      let cronSchedule: string | undefined
      if (agent.config) {
        try {
          const config = JSON.parse(agent.config as string)
          cronSchedule = config.cron_schedule
        } catch {}
      }
      const nextHeartbeat = getNextHeartbeat(agent.id, cronSchedule)

      agentStatuses.push({
        id: agent.id,
        name: agent.name,
        role: agent.role || 'Agent',
        avatar: agent.avatar || '',
        status,
        sessionKey: latestSession?.key,
        sessionId: latestSession?.sessionId,
        lastActivity: latestSession?.updatedAt,
        lastActivityAgo: latestSession ? formatTimeAgo(now - latestSession.updatedAt) : undefined,
        model: latestSession?.model,
        totalTokens: latestSession?.totalTokens,
        nextRunAtMs: nextHeartbeat?.nextRunAtMs,
        nextRunIn: nextHeartbeat?.nextRunIn,
      })
    }

    return NextResponse.json({
      ok: true,
      agents: agentStatuses,
      timestamp: now,
    })
  } catch (error) {
    console.error('Error fetching agent status:', error)

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      agents: [],
      timestamp: Date.now(),
    })
  }
}
