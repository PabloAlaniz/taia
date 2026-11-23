// Where a task stands, decided by the column it sits in on its workspace's
// board. Pure (types only), so server counts and client views share it.
//
// The board files a task in the column whose slug equals its status. Every
// page that counts "assigned", "in progress" or "in review" reads that same
// column through `taskStage`, so Team, the board and the dashboard agree.

/**
 * - todo: open, not started yet (inbox, backlog, to do, assigned…)
 * - in_progress: someone is working on it
 * - review: waiting for a check before it is done
 * - done: in one of the workspace's finished columns (done, rejected, published…)
 */
export type TaskStage = 'todo' | 'in_progress' | 'review' | 'done'

export const TASK_STAGES: readonly TaskStage[] = ['todo', 'in_progress', 'review', 'done']

export interface StageColumn {
  slug: string
  position?: number | null
  is_done_state?: boolean | null
  is_initial_state?: boolean | null
}

/** Per workspace id: each column slug and its stage. */
export type WorkspaceStages = ReadonlyMap<string, ReadonlyMap<string, TaskStage>>

/** Slugs that mean "waiting for a check", in the presets and common boards. */
const REVIEW_SLUG = /(^|_)(REVIEW|REVISION|REVISAO|QA)(_|$)/

/** Slugs that mean "not started", in the presets and common boards. */
const NOT_STARTED_SLUGS: ReadonlySet<string> = new Set([
  'INBOX',
  'IDEA',
  'IDEAS',
  'BACKLOG',
  'TODO',
  'TO_DO',
  'ASSIGNED',
  'READY',
  'PLANNED',
  'PLANIFICADO',
  'PENDIENTE',
  'POR_HACER',
  'LEAD',
])

/** The legacy finished statuses, used when a status has no column. */
const LEGACY_DONE: ReadonlySet<string> = new Set(['DONE', 'REJECTED'])

/** A slug's stage by its name alone: how a status with no column is read. */
export function statusStage(status: string): TaskStage {
  if (LEGACY_DONE.has(status)) return 'done'
  if (REVIEW_SLUG.test(status)) return 'review'
  if (NOT_STARTED_SLUGS.has(status)) return 'todo'
  return 'in_progress'
}

/**
 * The stage of each column of one workspace:
 * 1. a done column (is_done_state) is done;
 * 2. a column named for review (REVIEW, EN_REVISION, REVISION_FINAL, QA…) is review;
 * 3. the initial column, any column left of it, and columns named for
 *    waiting work (INBOX, BACKLOG, TODO, ASSIGNED, PLANIFICADO, LEAD…) are todo;
 * 4. every other open column is in progress: on a custom board, a column past
 *    the start that is neither review nor done is work under way.
 */
export function columnStages(columns: readonly StageColumn[]): Map<string, TaskStage> {
  const ordered = [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const initialIndex = Math.max(
    0,
    ordered.findIndex((c) => c.is_initial_state),
  )
  const stages = new Map<string, TaskStage>()
  ordered.forEach((column, index) => {
    let stage: TaskStage
    if (column.is_done_state) stage = 'done'
    else if (REVIEW_SLUG.test(column.slug)) stage = 'review'
    else if (index <= initialIndex || NOT_STARTED_SLUGS.has(column.slug)) stage = 'todo'
    else stage = 'in_progress'
    stages.set(column.slug, stage)
  })
  return stages
}

/** Column stages for every workspace the columns belong to. */
export function stagesByWorkspace(
  columns: readonly (StageColumn & { workspace_id: string })[],
): Map<string, Map<string, TaskStage>> {
  const grouped = new Map<string, StageColumn[]>()
  for (const column of columns) {
    const list = grouped.get(column.workspace_id) ?? []
    list.push(column)
    grouped.set(column.workspace_id, list)
  }
  const result = new Map<string, Map<string, TaskStage>>()
  grouped.forEach((list, workspaceId) => result.set(workspaceId, columnStages(list)))
  return result
}

/**
 * Where the task stands: its column's stage in its workspace. A status with
 * no column there (an old status, columns not loaded) is read by its name.
 */
export function taskStage(
  task: { status: string; workspace_id?: string | null },
  stages: WorkspaceStages,
): TaskStage {
  const ws = task.workspace_id ? stages.get(task.workspace_id) : undefined
  return ws?.get(task.status) ?? statusStage(task.status)
}

/** Open means not done: the load a participant still carries. */
export function isOpenStage(stage: TaskStage): boolean {
  return stage !== 'done'
}

/** How many of the tasks sit in each stage. */
export function countStages(
  tasks: readonly { status: string; workspace_id?: string | null }[],
  stages: WorkspaceStages,
): Record<TaskStage, number> {
  const counts: Record<TaskStage, number> = { todo: 0, in_progress: 0, review: 0, done: 0 }
  for (const task of tasks) counts[taskStage(task, stages)]++
  return counts
}
