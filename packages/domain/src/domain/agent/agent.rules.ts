// Pure business rules for agents — no I/O, no imports from DB/infra

import type { Task } from '@taia/types'

export interface AgentStatusResult {
  working: Set<string>
  blocked: Set<string>
}

/**
 * Compute which agents are WORKING vs BLOCKED based on task assignments.
 */
export function computeAgentStatuses(tasks: Task[]): AgentStatusResult {
  const working = new Set<string>()
  const blocked = new Set<string>()

  for (const task of tasks) {
    if (task.assigned_to) {
      if (task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS') {
        working.add(task.assigned_to)
      } else if (task.tags?.includes('blocked')) {
        blocked.add(task.assigned_to)
      }
    }
  }

  return { working, blocked }
}

/**
 * Determine agent status from working/blocked sets.
 */
export function resolveAgentStatus(
  agentId: string,
  statuses: AgentStatusResult,
): 'IDLE' | 'WORKING' | 'BLOCKED' {
  if (statuses.working.has(agentId)) return 'WORKING'
  if (statuses.blocked.has(agentId)) return 'BLOCKED'
  return 'IDLE'
}

/**
 * Sort agents: orchestrators first, then alphabetical.
 */
export function sortAgents<T extends { type: string; name: string }>(agents: T[]): T[] {
  return [...agents].sort((a, b) => {
    if (a.type === 'orchestrator') return -1
    if (b.type === 'orchestrator') return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Extract @mentions from message content.
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g
  const mentions: string[] = []
  let match
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase())
  }
  return mentions
}
