// Task dependency repository — CRUD for task blocks/blocked-by relationships

import type { TaskDependency, TaskDependencyDetail } from '@taia/types'
import { pool, generateId } from '../pool'

function normalizeDependency(row: Record<string, unknown>): TaskDependency {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    depends_on_task_id: row.depends_on_task_id as string,
    created_at: row.created_at as string,
  }
}

function normalizeDependencyDetail(row: Record<string, unknown>): TaskDependencyDetail {
  return {
    ...normalizeDependency(row),
    depends_on_title: (row.depends_on_title as string | undefined) || undefined,
    depends_on_status: (row.depends_on_status as string | undefined) || undefined,
    task_title: (row.task_title as string | undefined) || undefined,
    task_status: (row.task_status as string | undefined) || undefined,
  }
}

/** Get all tasks that `taskId` depends on (blockers) */
export async function getBlockersForTask(taskId: string): Promise<TaskDependencyDetail[]> {
  const res = await pool.query(
    `SELECT td.*, t.title AS depends_on_title, t.status AS depends_on_status
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE td.task_id = $1
     ORDER BY td.created_at`,
    [taskId],
  )
  return res.rows.map(normalizeDependencyDetail)
}

/** Get all tasks that are blocked by `taskId` (dependents) */
export async function getDependentsOfTask(taskId: string): Promise<TaskDependencyDetail[]> {
  const res = await pool.query(
    `SELECT td.*, t.title AS task_title, t.status AS task_status
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.task_id
     WHERE td.depends_on_task_id = $1
     ORDER BY td.created_at`,
    [taskId],
  )
  return res.rows.map(normalizeDependencyDetail)
}

/** Add a dependency: taskId depends on dependsOnTaskId */
export async function addDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<TaskDependency> {
  const id = generateId()
  await pool.query(
    `INSERT INTO task_dependencies (id, task_id, depends_on_task_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (task_id, depends_on_task_id) DO NOTHING`,
    [id, taskId, dependsOnTaskId],
  )
  // Return the existing or newly created dependency
  const res = await pool.query(
    `SELECT * FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2`,
    [taskId, dependsOnTaskId],
  )
  return normalizeDependency(res.rows[0])
}

/** Remove a specific dependency by ID */
export async function removeDependencyById(dependencyId: string): Promise<boolean> {
  const res = await pool.query('DELETE FROM task_dependencies WHERE id = $1', [dependencyId])
  return (res.rowCount ?? 0) > 0
}

/** Remove dependency by task pair */
export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  const res = await pool.query(
    'DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
    [taskId, dependsOnTaskId],
  )
  return (res.rowCount ?? 0) > 0
}

/**
 * Check if adding a dependency would create a cycle.
 * Uses a recursive CTE to walk the dependency graph from dependsOnTaskId
 * and checks if we'd reach taskId (which would mean a cycle).
 */
export async function wouldCreateCycle(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  // If taskId depends on dependsOnTaskId, we need to check if dependsOnTaskId
  // already (transitively) depends on taskId. If so, adding this edge creates a cycle.
  const res = await pool.query(
    `WITH RECURSIVE dep_chain AS (
       -- Start from what dependsOnTaskId depends on
       SELECT depends_on_task_id AS reachable
       FROM task_dependencies
       WHERE task_id = $2

       UNION

       -- Walk transitively
       SELECT td.depends_on_task_id
       FROM task_dependencies td
       JOIN dep_chain dc ON td.task_id = dc.reachable
     )
     SELECT 1 FROM dep_chain WHERE reachable = $1
     LIMIT 1`,
    [taskId, dependsOnTaskId],
  )
  // Also check direct: if dependsOnTaskId == taskId (self-ref, handled by DB constraint)
  if (taskId === dependsOnTaskId) return true
  return res.rows.length > 0
}

/** Check if all blockers of a task are in DONE or REJECTED status */
export async function areAllBlockersResolved(taskId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT COUNT(*) AS pending
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE td.task_id = $1 AND t.status NOT IN ('DONE', 'REJECTED')`,
    [taskId],
  )
  return parseInt(res.rows[0].pending, 10) === 0
}

/** Get unresolved blockers count for a task */
export async function getUnresolvedBlockerCount(taskId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) AS count
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE td.task_id = $1 AND t.status NOT IN ('DONE', 'REJECTED')`,
    [taskId],
  )
  return parseInt(res.rows[0].count, 10)
}
