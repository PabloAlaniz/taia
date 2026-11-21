// Agent runtime helpers — thin convenience layer over the runtime adapters
// for per-agent sessions, transcripts and spawning. Per-agent calls go to the
// agent's instance; listings merge every instance.

import { forEachRuntime, getRuntimeAdapterForAgent, mergeAgentListings } from './runtime'
import { RuntimeCapability, type RuntimeMessage, type RuntimeSession } from '@taia/runtime'

export interface AgentSession {
  key: string
  sessionId: string
  updatedAt: number
  label?: string
  channel?: string
  model?: string
  totalTokens?: number
}

export interface AgentInfo {
  id: string
  sessions: AgentSession[]
  latestSession?: AgentSession
}

function toAgentSession(s: RuntimeSession): AgentSession {
  return {
    key: s.key,
    sessionId: s.sessionId,
    updatedAt: s.updatedAt,
    label: s.label,
    channel: s.channel,
    model: s.model,
    totalTokens: s.totalTokens,
  }
}

// List the agents of every runtime instance
export async function listAgents(): Promise<string[]> {
  try {
    const { results } = await forEachRuntime((adapter) => adapter.listAgents())
    const agents = await mergeAgentListings(results, (a) => a.id)
    return agents.map((a) => a.value.id)
  } catch {
    return []
  }
}

// Get sessions for a specific agent
export async function getAgentSessions(agentId: string): Promise<AgentSession[]> {
  try {
    const adapter = await getRuntimeAdapterForAgent(agentId)
    if (!adapter.capabilities.has(RuntimeCapability.Sessions) || !adapter.listSessions) return []
    const sessions = await adapter.listSessions({ activeMinutes: 10080 }) // last 7 days
    return sessions.filter((s) => s.agentId === agentId).map(toAgentSession)
  } catch {
    return []
  }
}

// Read recent entries from the agent's most recent session transcript
export async function readTranscript(
  agentId: string,
  _sessionId: string,
  lastN: number = 10,
): Promise<RuntimeMessage[]> {
  try {
    const adapter = await getRuntimeAdapterForAgent(agentId)
    if (!adapter.capabilities.has(RuntimeCapability.Transcripts) || !adapter.getSessionHistory) {
      return []
    }
    const [latest] = (await getAgentSessions(agentId)).sort((a, b) => b.updatedAt - a.updatedAt)
    if (!latest) return []
    const messages = await adapter.getSessionHistory(latest.key, { limit: lastN })

    // Filter to messages only (user + assistant), skip tool results
    return messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  } catch {
    return []
  }
}

// Get full agent info with sessions
export async function getAgentInfo(agentId: string): Promise<AgentInfo | null> {
  const sessions = await getAgentSessions(agentId)

  if (sessions.length === 0) return null

  sessions.sort((a, b) => b.updatedAt - a.updatedAt)

  return {
    id: agentId,
    sessions,
    latestSession: sessions[0],
  }
}

// List all agents with their latest session info
export async function listAgentsWithStatus(): Promise<AgentInfo[]> {
  const agentIds = await listAgents()

  const results = await Promise.all(agentIds.map((id) => getAgentInfo(id)))

  return results.filter(Boolean) as AgentInfo[]
}

// Spawn agent via the runtime adapter
export async function spawnAgent(
  agentId: string,
  task: string,
  options?: {
    label?: string
    timeoutSeconds?: number
    model?: string
  },
): Promise<{ ok: boolean; error?: string; sessionKey?: string; runId?: string }> {
  try {
    const adapter = await getRuntimeAdapterForAgent(agentId)
    if (!adapter.capabilities.has(RuntimeCapability.Sessions) || !adapter.spawnSession) {
      return { ok: false, error: 'Runtime does not support sessions' }
    }
    const result = await adapter.spawnSession(task, {
      agentId,
      label: options?.label,
      runTimeoutSeconds: options?.timeoutSeconds,
      model: options?.model,
    })

    return {
      ok: true,
      sessionKey: result.sessionKey,
      runId: result.runId,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// Parse a cron expression like "0,15,30,45 * * * *" and extract minute values
function parseCronMinutes(cronExpr: string): number[] | null {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length < 5) return null
  const minutePart = parts[0]
  const minutes = minutePart
    .split(',')
    .map((m) => parseInt(m, 10))
    .filter((m) => !isNaN(m))
  return minutes.length > 0 ? minutes.sort((a, b) => a - b) : null
}

// Calculate next heartbeat for an agent given a cron expression
export function getNextHeartbeat(
  _agentId: string,
  cronExpr?: string,
): { nextRunAtMs: number; nextRunIn: string } | null {
  if (!cronExpr) return null

  const minutes = parseCronMinutes(cronExpr)
  if (!minutes) return null

  const now = new Date()
  const currentMinute = now.getMinutes()

  let nextMinute = minutes.find((m) => m > currentMinute)
  let hoursToAdd = 0

  if (nextMinute === undefined) {
    nextMinute = minutes[0]
    hoursToAdd = 1
  }

  const nextRun = new Date(now)
  nextRun.setHours(now.getHours() + hoursToAdd)
  nextRun.setMinutes(nextMinute)
  nextRun.setSeconds(0)
  nextRun.setMilliseconds(0)

  const diffMs = nextRun.getTime() - now.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffSeconds = Math.floor((diffMs % 60000) / 1000)

  let nextRunIn: string
  if (diffMinutes > 0) {
    nextRunIn = `${diffMinutes}m ${diffSeconds}s`
  } else {
    nextRunIn = `${diffSeconds}s`
  }

  return {
    nextRunAtMs: nextRun.getTime(),
    nextRunIn,
  }
}

// Recent sessions of every runtime instance, newest first
export async function listSessions(options?: { limit?: number }) {
  const limit = options?.limit || 50
  try {
    const { results } = await forEachRuntime(async (adapter) =>
      adapter.capabilities.has(RuntimeCapability.Sessions) && adapter.listSessions
        ? adapter.listSessions({ limit })
        : [],
    )
    const sessions = results
      .flatMap((r) => r.value)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
    return { ok: true, sessions: sessions.map(toAgentSession) }
  } catch {
    return { ok: true, sessions: [] }
  }
}
