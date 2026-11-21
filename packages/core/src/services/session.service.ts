// Session service — list, detail, and active session monitoring across every
// runtime instance. Listings merge what each instance reports; a session's
// detail is read from the instance that owns it.

import { forEachRuntime, getRuntimeAdapter } from '../runtime'
import { getAllAgents, getRuntimeSession } from '../db/index'
import { calculateCost } from './cost.service'
import {
  RuntimeCapability,
  type AgentRuntimeAdapter,
  type RuntimeMessage,
  type RuntimeSession,
} from '@taia/runtime'
import type {
  AgentLiveStatus,
  SessionListItem,
  ActiveSession,
  SessionDetail,
  TranscriptEntry,
  TranscriptPart,
} from '@taia/types'

// --- Status computation ---

const LIVE_THRESHOLD_MS = 3 * 60 * 1000 // 3 minutes
const IDLE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

export function computeSessionStatus(updatedAt: number): AgentLiveStatus {
  const elapsed = Date.now() - updatedAt
  if (elapsed < LIVE_THRESHOLD_MS) return 'live'
  if (elapsed < IDLE_THRESHOLD_MS) return 'idle'
  return 'offline'
}

export function formatTimeAgo(updatedAt: number): string {
  const elapsed = Date.now() - updatedAt
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// --- Agent ID extraction ---

/**
 * Agent a session belongs to: the adapter-reported `agentId`, falling back to
 * the `agent:{agentId}:…` key convention for adapters that don't report it.
 */
export function extractAgentId(sessionKey: string, reportedAgentId?: string): string {
  if (reportedAgentId) return reportedAgentId
  const match = sessionKey.match(/^agent:([^:]+):/)
  if (match) return match[1]
  // Fallback: use first segment before /
  return sessionKey.split('/')[0] || 'unknown'
}

// --- Transcript simplification (extracted from live/route.ts) ---

function simplifyMessage(entry: RuntimeMessage): TranscriptEntry | null {
  if (entry.role === 'user') {
    const text =
      typeof entry.content === 'string'
        ? entry.content
        : Array.isArray(entry.content)
          ? (entry.content as Array<{ text?: string }>)[0]?.text || ''
          : ''
    return {
      id: entry.id || crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: entry.timestamp,
    }
  }

  if (entry.role === 'assistant') {
    const parts: TranscriptPart[] = []
    const contentArr = Array.isArray(entry.content) ? entry.content : []
    for (const part of contentArr as Array<Record<string, unknown>>) {
      if (part.type === 'thinking') {
        parts.push({
          type: 'thinking',
          text: String(part.thinking || ''),
        })
      } else if (part.type === 'text') {
        parts.push({
          type: 'text',
          text: String(part.text || ''),
        })
      } else if (part.type === 'toolCall') {
        parts.push({
          type: 'tool',
          name: String(part.name || ''),
          preview: JSON.stringify(part.arguments || {}).slice(0, 200),
        })
      }
    }
    return {
      id: entry.id || crypto.randomUUID(),
      role: 'assistant',
      parts,
      model: entry.model,
      timestamp: entry.timestamp,
    }
  }

  return null
}

// --- Agent enrichment cache ---

interface AgentMeta {
  name: string
  avatar: string
}

async function getAgentMap(): Promise<Map<string, AgentMeta>> {
  try {
    const agents = await getAllAgents()
    const map = new Map<string, AgentMeta>()
    for (const a of agents) {
      map.set(a.id, { name: a.name, avatar: a.avatar || '🤖' })
    }
    return map
  } catch {
    return new Map()
  }
}

// --- Session to SessionListItem ---

function toSessionListItem(
  session: RuntimeSession,
  instanceId: string,
  agentMap: Map<string, AgentMeta>,
): SessionListItem {
  const agentId = extractAgentId(session.key, session.agentId)
  const agent = agentMap.get(agentId)
  const model = session.model || undefined
  const totalTokens = session.totalTokens || 0
  const inputTokens = session.inputTokens || 0
  const outputTokens = session.outputTokens || 0
  const cost =
    totalTokens > 0
      ? calculateCost(
          totalTokens,
          model || 'unknown',
          inputTokens || undefined,
          outputTokens || undefined,
        )
      : undefined

  return {
    key: session.key,
    sessionId: session.sessionId,
    instanceId,
    agentId,
    agentName: agent?.name,
    agentAvatar: agent?.avatar,
    label: session.label,
    model,
    status: computeSessionStatus(session.updatedAt),
    totalTokens: totalTokens || undefined,
    inputTokens: inputTokens || undefined,
    outputTokens: outputTokens || undefined,
    estimatedCostUsd: cost,
    updatedAt: session.updatedAt,
    lastActivityAgo: formatTimeAgo(session.updatedAt),
    messageCount: session.messages?.length,
  }
}

// --- Fan-out ---

function supportsSessions(adapter: AgentRuntimeAdapter): boolean {
  return adapter.capabilities.has(RuntimeCapability.Sessions) && !!adapter.listSessions
}

interface InstanceSession {
  instanceId: string
  adapter: AgentRuntimeAdapter
  session: RuntimeSession
}

/** Sessions of every instance that has them, tagged with their instance. */
async function listInstanceSessions(options: {
  limit?: number
  activeMinutes?: number
}): Promise<InstanceSession[]> {
  const { results } = await forEachRuntime(async (adapter, instanceId) =>
    supportsSessions(adapter)
      ? (await adapter.listSessions!(options)).map((session) => ({ instanceId, adapter, session }))
      : [],
  )
  return results.flatMap((r) => r.value)
}

// --- Public API ---

export interface ListSessionsOptions {
  agentId?: string
  status?: 'active' | 'recent' | 'all'
  limit?: number
}

export async function listSessions(options?: ListSessionsOptions): Promise<SessionListItem[]> {
  const limit = options?.limit || 50
  const activeMinutes = options?.status === 'active' ? 15 : undefined
  const [sessions, agentMap] = await Promise.all([
    listInstanceSessions({ limit, activeMinutes }),
    getAgentMap(),
  ])

  let items = sessions.map((s) => toSessionListItem(s.session, s.instanceId, agentMap))

  // Filter by agent if requested
  if (options?.agentId) {
    items = items.filter((s) => s.agentId === options.agentId)
  }

  // Filter by status
  if (options?.status === 'active') {
    items = items.filter((s) => s.status === 'live' || s.status === 'idle')
  } else if (options?.status === 'recent') {
    items = items.filter((s) => s.status !== 'offline')
  }

  // Newest first; each instance applied the limit, so apply it again overall.
  items.sort((a, b) => b.updatedAt - a.updatedAt)

  return items.slice(0, limit)
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
  const [sessions, agentMap] = await Promise.all([
    listInstanceSessions({ activeMinutes: 15 }),
    getAgentMap(),
  ])

  const activeSessions = sessions.filter(({ session }) => {
    const status = computeSessionStatus(session.updatedAt)
    return status === 'live' || status === 'idle'
  })

  const results: ActiveSession[] = []

  for (const { instanceId, adapter, session } of activeSessions) {
    const base = toSessionListItem(session, instanceId, agentMap)

    // Get recent messages for context
    let currentAction: string | undefined
    let recentTools: string[] = []
    let messagePreview: string | undefined

    if (adapter.capabilities.has(RuntimeCapability.Transcripts) && adapter.getSessionHistory) {
      try {
        const messages = await adapter.getSessionHistory(session.key, { limit: 5 })
        const simplified = messages
          .map((m) => simplifyMessage(m))
          .filter(Boolean) as TranscriptEntry[]

        // Extract recent tools from assistant messages
        for (const msg of simplified) {
          if (msg.role === 'assistant' && msg.parts) {
            for (const part of msg.parts) {
              if (part.type === 'tool' && part.name) {
                recentTools.push(part.name)
              }
            }
          }
        }
        recentTools = recentTools.slice(-5)

        // Get last assistant text for preview
        const lastAssistant = simplified.filter((m) => m.role === 'assistant').pop()
        if (lastAssistant?.parts) {
          const textPart = lastAssistant.parts.find((p) => p.type === 'text')
          if (textPart?.text) {
            messagePreview = textPart.text.slice(0, 100) + (textPart.text.length > 100 ? '...' : '')
          }
          const toolPart = lastAssistant.parts.find((p) => p.type === 'tool')
          if (toolPart?.name) {
            currentAction = `🔧 ${toolPart.name}`
          }
        }
      } catch {
        // Ignore transcript fetch errors for active view
      }
    }

    results.push({
      ...base,
      currentAction,
      recentTools,
      messagePreview,
    })
  }

  return results
}

/**
 * Find a session and the instance that owns it: the given instance, else the
 * one recorded for it (TAIA-hosted sessions), else whichever instance lists it.
 */
async function findSession(
  sessionKey: string,
  instanceId?: string,
): Promise<InstanceSession | null> {
  const findIn = async (adapter: AgentRuntimeAdapter) =>
    supportsSessions(adapter)
      ? (await adapter.listSessions!({ limit: 200 })).find((s) => s.key === sessionKey)
      : undefined

  const ownerId = instanceId ?? (await getRuntimeSession(sessionKey))?.instance_id
  if (ownerId) {
    const adapter = await getRuntimeAdapter(ownerId)
    const session = await findIn(adapter)
    return session ? { instanceId: ownerId, adapter, session } : null
  }

  const { results } = await forEachRuntime(async (adapter, id) => {
    const session = await findIn(adapter)
    return session ? { instanceId: id, adapter, session } : null
  })
  return results.find((r) => r.value)?.value ?? null
}

export interface SessionDetailOptions {
  /** The instance that owns the session, when the caller knows it. */
  instanceId?: string
  limit?: number
  includeTools?: boolean
}

export async function getSessionDetail(
  sessionKey: string,
  options?: SessionDetailOptions,
): Promise<SessionDetail | null> {
  const found = await findSession(sessionKey, options?.instanceId)
  if (!found) return null
  const { instanceId, adapter, session } = found

  const agentMap = await getAgentMap()
  const agentId = extractAgentId(sessionKey, session.agentId)
  const agent = agentMap.get(agentId)

  const messages =
    adapter.capabilities.has(RuntimeCapability.Transcripts) && adapter.getSessionHistory
      ? await adapter.getSessionHistory(sessionKey, {
          limit: options?.limit || 100,
          includeTools: options?.includeTools ?? true,
        })
      : []

  const simplified = messages.map((m) => simplifyMessage(m)).filter(Boolean) as TranscriptEntry[]

  const totalTokens = session.totalTokens || 0
  const cost =
    totalTokens > 0
      ? calculateCost(
          totalTokens,
          session.model || 'unknown',
          session.inputTokens || undefined,
          session.outputTokens || undefined,
        )
      : undefined

  return {
    key: sessionKey,
    sessionId: session.sessionId,
    instanceId,
    agentId,
    agentName: agent?.name,
    model: session.model,
    label: session.label,
    status: computeSessionStatus(session.updatedAt),
    messages: simplified,
    totalTokens: totalTokens || undefined,
    estimatedCostUsd: cost,
  }
}
