import type { Task } from '@taia/types'
import {
  countStages,
  stagesByWorkspace,
  taskStage,
  type TaskStage,
  type WorkspaceStages,
} from '@taia/core/services/task-stage'

export interface AgentDayCount {
  agentId: string
  count: number
}

export interface DailyCompletion {
  date: string // YYYY-MM-DD
  total: number
  byAgent: AgentDayCount[]
}

/** Used when the workspace's columns are unknown: the legacy finished status. */
export const DEFAULT_DONE_SLUGS: ReadonlySet<string> = new Set(['DONE'])

/**
 * The statuses that count as "completed": the workspace's finished columns
 * (is_done_state), so a board that finishes in PUBLICADO counts too. TAIA's
 * own REJECTED is finished but not completed, so it never counts.
 */
export function completedSlugs(
  columns: readonly { slug: string; is_done_state?: boolean | null }[] | null | undefined,
): ReadonlySet<string> {
  const slugs = (columns ?? [])
    .filter((c) => c.is_done_state && c.slug !== 'REJECTED')
    .map((c) => c.slug)
  return slugs.length > 0 ? new Set(slugs) : DEFAULT_DONE_SLUGS
}

/** True when the task sits in a column that counts as completed. */
export function isCompleted(
  task: Pick<Task, 'status'>,
  doneSlugs: ReadonlySet<string> = DEFAULT_DONE_SLUGS,
): boolean {
  return doneSlugs.has(task.status)
}

/**
 * Each column's stage (todo, in progress, review, done), the reading the team
 * page and the board share (see @taia/core task-stage). With no columns, a
 * task is read by its status name.
 */
export function boardStages(
  columns:
    | readonly {
        workspace_id: string
        slug: string
        position?: number | null
        is_done_state?: boolean | null
        is_initial_state?: boolean | null
      }[]
    | null
    | undefined,
): WorkspaceStages {
  return stagesByWorkspace(columns ?? [])
}

/** How many tasks sit in each stage right now. */
export function stageCounts(
  tasks: readonly Task[],
  stages: WorkspaceStages,
): Record<TaskStage, number> {
  return countStages(tasks, stages)
}

/** Open = not in a done column: what a participant still holds. */
export function isOpen(
  task: Pick<Task, 'status' | 'workspace_id'>,
  stages: WorkspaceStages,
): boolean {
  return taskStage(task, stages) !== 'done'
}

/**
 * Stale = held by someone, in a not-started column (Asignadas, Backlog…),
 * and untouched for a day.
 */
export function isStale(
  task: Pick<Task, 'status' | 'workspace_id' | 'assigned_to' | 'updated_at'>,
  stages: WorkspaceStages,
  now: Date = new Date(),
): boolean {
  if (!task.assigned_to || taskStage(task, stages) !== 'todo') return false
  return new Date(task.updated_at).getTime() < now.getTime() - 24 * 60 * 60 * 1000
}

/**
 * When a completed task finished. completed_at is the record; rows finished
 * before it was stamped for every finished column fall back to their last
 * update, the closest thing on record to the move into the column.
 */
export function completionDate(task: Pick<Task, 'completed_at' | 'updated_at'>): Date | null {
  const raw = task.completed_at || task.updated_at
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Computes daily completion counts for the last N days, broken down by
 * assignee. Counts tasks in a completed column (see `completedSlugs`).
 */
export function computeDailyCompletions(
  tasks: Task[],
  days = 30,
  doneSlugs: ReadonlySet<string> = DEFAULT_DONE_SLUGS,
): DailyCompletion[] {
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
    if (!isCompleted(task, doneSlugs)) continue
    const completedDate = completionDate(task)
    if (!completedDate || completedDate < cutoff) continue

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
