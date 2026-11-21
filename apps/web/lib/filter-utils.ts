import type { Task, SavedFilter, SavedFilterConfig, BoardColumn } from '@taia/types'

/**
 * Apply a filter config object to a list of tasks.
 * Returns a new array with only the tasks that match ALL criteria (AND logic).
 */
export function applyFilterConfigDirect(
  tasks: Task[],
  cfg: SavedFilterConfig,
  boardColumns: BoardColumn[],
): Task[] {
  let result = tasks

  if (cfg.status) result = result.filter((t) => t.status === cfg.status)
  if (cfg.priority) result = result.filter((t) => t.priority === cfg.priority)
  if (cfg.assigned_to) result = result.filter((t) => t.assigned_to === cfg.assigned_to)
  if (cfg.project_id) result = result.filter((t) => t.project_id === cfg.project_id)
  if (cfg.assigned) result = result.filter((t) => !!t.assigned_to)
  if (cfg.unassigned) result = result.filter((t) => !t.assigned_to)

  if (cfg.q) {
    const q = cfg.q.toLowerCase()
    result = result.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
    )
  }

  if (cfg.tags && cfg.tags.length > 0) {
    result = result.filter((t) => cfg.tags!.some((tag) => t.tags?.includes(tag)))
  }

  if (cfg.due === 'today') {
    const today = new Date().toISOString().split('T')[0]
    result = result.filter((t) => t.due_date && t.due_date.split('T')[0] === today)
  } else if (cfg.due === 'overdue') {
    const now = new Date()
    const doneSlugs = new Set(boardColumns.filter((c) => c.is_done_state).map((c) => c.slug))
    result = result.filter(
      (t) => t.due_date && new Date(t.due_date) < now && !doneSlugs.has(t.status),
    )
  } else if (cfg.due === 'this-week') {
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
    result = result.filter((t) => t.due_date && new Date(t.due_date) <= weekEnd)
  }

  if (cfg.has_blockers) {
    result = result.filter((t) => t.tags?.includes('blocked'))
  }

  return result
}

/**
 * Apply a saved filter's config to a list of tasks (wrapper for backward compat).
 */
export function applyFilterConfig(
  tasks: Task[],
  filter: SavedFilter | undefined,
  boardColumns: BoardColumn[],
): Task[] {
  if (!filter) return tasks
  return applyFilterConfigDirect(tasks, filter.filter_config, boardColumns)
}

/**
 * Apply unified filter config + project sidebar selection.
 * Used by the main board page.
 */
export function applyAllFilters(
  tasks: Task[],
  config: SavedFilterConfig,
  boardColumns: BoardColumn[],
  selectedProjectId: string | null,
): Task[] {
  let result = applyFilterConfigDirect(tasks, config, boardColumns)

  if (selectedProjectId) {
    result = result.filter((t) => t.project_id === selectedProjectId)
  }

  return result
}
