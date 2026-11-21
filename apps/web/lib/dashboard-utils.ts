import type { Task } from '@taia/types'

export interface AgentDayCount {
  agentId: string
  count: number
}

export interface DailyCompletion {
  date: string // YYYY-MM-DD
  total: number
  byAgent: AgentDayCount[]
}

export const AGENT_COLORS = [
  'bg-emerald-500/70',
  'bg-blue-500/70',
  'bg-purple-500/70',
  'bg-amber-500/70',
  'bg-pink-500/70',
  'bg-cyan-500/70',
  'bg-lime-500/70',
  'bg-rose-500/70',
]

/**
 * Returns a stable color class for an agent based on its sorted position.
 */
export function getAgentColor(agentId: string, agentIds: string[]): string {
  const sorted = [...agentIds].sort()
  const idx = sorted.indexOf(agentId)
  return AGENT_COLORS[idx % AGENT_COLORS.length]
}

/**
 * Computes daily completion counts for the last N days, broken down by agent.
 * Only counts tasks with status === 'DONE' and a valid completed_at date.
 */
export function computeDailyCompletions(tasks: Task[], days = 30): DailyCompletion[] {
  const now = new Date()

  // Build map of date strings for the last N days
  const dateMap = new Map<string, Map<string, number>>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dateMap.set(formatDate(d), new Map())
  }

  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)

  // Filter and bucket
  for (const task of tasks) {
    if (task.status !== 'DONE' || !task.completed_at) continue

    const completedDate = new Date(task.completed_at)
    if (completedDate < cutoff) continue

    const dateKey = formatDate(completedDate)
    // Only count if this date falls within our range
    const agentMap = dateMap.get(dateKey)
    if (!agentMap) continue

    const agentId = task.assigned_to || 'unassigned'
    agentMap.set(agentId, (agentMap.get(agentId) || 0) + 1)
  }

  // Convert to result array
  const result: DailyCompletion[] = []
  dateMap.forEach((agentMap, date) => {
    const byAgent: AgentDayCount[] = []
    agentMap.forEach((count, agentId) => {
      byAgent.push({ agentId, count })
    })
    byAgent.sort((a, b) => b.count - a.count)

    result.push({
      date,
      total: byAgent.reduce((sum, a) => sum + a.count, 0),
      byAgent,
    })
  })

  return result
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
