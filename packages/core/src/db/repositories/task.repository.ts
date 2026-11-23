// Task repository — async only, no sync wrappers

import type { Task, TaskStatus, TaskPriority, Confidence } from '@taia/types'
import { pool, generateId } from '../pool'

/**
 * SQL that is TRUE when `status` is a finished column of `workspace`: the
 * workspace's own column decides (its is_done_state), and a status with no
 * column row (boards from before configurable columns) falls back to the
 * legacy DONE / REJECTED. Inside an UPDATE, column references read the row
 * as it was before the update.
 */
export function doneStateSql(status: string, workspace: string): string {
  return `COALESCE((SELECT bc.is_done_state FROM board_columns bc WHERE bc.workspace_id = ${workspace} AND bc.slug = ${status} LIMIT 1), ${status} IN ('DONE', 'REJECTED'))`
}

/**
 * completed_at for a task whose status becomes `status`: stamped when it lands
 * in a finished column (kept if it was already finished), cleared when it
 * leaves one. Meant for `SET completed_at = …` in an UPDATE on tasks.
 */
export function completedAtSql(status: string): string {
  const willBeDone = doneStateSql(status, 'tasks.workspace_id')
  const wasDone = doneStateSql('tasks.status', 'tasks.workspace_id')
  return `CASE WHEN ${willBeDone} THEN (CASE WHEN ${wasDone} THEN COALESCE(tasks.completed_at, NOW()) ELSE NOW() END) ELSE NULL END`
}

export async function getAllTasks(options?: {
  archiveBefore?: Date
  workspaceId?: string
}): Promise<Task[]> {
  const params: unknown[] = []
  const conditions: string[] = []

  if (options?.workspaceId) {
    params.push(options.workspaceId)
    conditions.push(`t.workspace_id = $${params.length}`)
  }

  if (options?.archiveBefore) {
    params.push(options.archiveBefore.toISOString())
    conditions.push(
      `(bc.is_done_state = FALSE OR COALESCE(t.completed_at, t.updated_at) >= $${params.length}::timestamp)`,
    )
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const res = await pool.query(
    `
    SELECT
      t.id, t.title, t.description, t.status, t.priority,
      t.confidence, t.assigned_to, t.created_by, t.project, t.project_id, t.workspace_id, t.repo_url,
      t.session_key,
      t.created_at, t.updated_at, t.started_at, t.completed_at,
      t.time_spent_minutes, t.due_date, t.estimated_minutes,
      COALESCE(
        (SELECT array_agg(tag) FROM task_tags WHERE task_id = t.id),
        ARRAY[]::text[]
      ) as tags,
      (SELECT r.url FROM repositories r WHERE r.project_id = t.project_id AND r.is_primary = TRUE LIMIT 1) as primary_repo_url
    FROM tasks t
    LEFT JOIN board_columns bc ON bc.workspace_id = t.workspace_id AND bc.slug = t.status
    ${whereClause}
    ORDER BY
      COALESCE(bc.position, 999),
      t.updated_at DESC
  `,
    params,
  )

  return res.rows.map((row) => ({
    ...row,
    created_by: row.created_by || 'unknown',
    tags: row.tags || [],
  }))
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const res = await pool.query(
    `
    SELECT t.*, t.workspace_id,
      (SELECT r.url FROM repositories r WHERE r.project_id = t.project_id AND r.is_primary = TRUE LIMIT 1) as primary_repo_url
    FROM tasks t WHERE t.id = $1
  `,
    [id],
  )
  if (res.rows.length === 0) return undefined

  const task = res.rows[0]
  const tagsRes = await pool.query('SELECT tag FROM task_tags WHERE task_id = $1', [id])
  task.tags = tagsRes.rows.map((r) => r.tag)

  return task
}

export async function createTask(data: {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  confidence?: Confidence
  project?: string
  project_id?: string
  workspace_id?: string
  repo_url?: string
  tags?: string[]
  assigned_to?: string
  created_by: string
}): Promise<Task> {
  const id = generateId()
  const client = await pool.connect()

  // If assigned_to is set and no explicit status, default to ASSIGNED instead of INBOX
  const effectiveStatus = data.status || (data.assigned_to ? 'ASSIGNED' : 'INBOX')

  try {
    await client.query('BEGIN')

    await client.query(
      `
      INSERT INTO tasks (id, title, description, status, priority, confidence, project, project_id, workspace_id, repo_url, assigned_to, created_by, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        CASE WHEN ${doneStateSql('$4::text', '$9::text')} THEN NOW() END)
    `,
      [
        id,
        data.title,
        data.description || null,
        effectiveStatus,
        data.priority || 'MEDIUM',
        data.confidence || 'needs-approval',
        data.project || null,
        data.project_id || null,
        data.workspace_id || 'ws-default',
        data.repo_url || null,
        data.assigned_to || null,
        data.created_by,
      ],
    )

    if (data.tags && data.tags.length > 0) {
      for (const tag of data.tags) {
        await client.query('INSERT INTO task_tags (task_id, tag) VALUES ($1, $2)', [id, tag])
      }
    }

    // NOTE: Activity logging moved to task.service.ts (single responsibility)

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return (await getTaskById(id))!
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const task = await getTaskById(id)
  if (!task) return null

  // If assigning a task that's in INBOX, automatically move to ASSIGNED
  if (updates.assigned_to && task.status === 'INBOX' && !updates.status) {
    updates.status = 'ASSIGNED' as TaskStatus
  }

  const allowedFields = [
    'title',
    'description',
    'status',
    'priority',
    'confidence',
    'assigned_to',
    'project',
    'project_id',
    'repo_url',
    'session_key',
    'started_at',
    'completed_at',
    'time_spent_minutes',
    'due_date',
    'estimated_minutes',
  ]
  const sets: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      sets.push(`${key} = $${paramIndex}`)
      values.push(value)
      paramIndex++
    }
  }

  // A status change stamps or clears completed_at from the workspace's own
  // columns (any is_done_state column, not only DONE), unless the caller set
  // completed_at itself.
  if (updates.status && updates.completed_at === undefined) {
    const statusParam = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .indexOf('status')
    sets.push(`completed_at = ${completedAtSql(`$${statusParam + 1}::text`)}`)
  }

  if (sets.length > 0) {
    values.push(id)
    await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${paramIndex}`, values)
  }

  if (updates.tags) {
    await pool.query('DELETE FROM task_tags WHERE task_id = $1', [id])
    for (const tag of updates.tags) {
      await pool.query('INSERT INTO task_tags (task_id, tag) VALUES ($1, $2)', [id, tag])
    }
  }

  return (await getTaskById(id)) || null
}

export async function deleteTask(id: string): Promise<boolean> {
  const task = await getTaskById(id)
  if (!task) return false

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM task_tags WHERE task_id = $1', [id])
    await client.query(
      'DELETE FROM message_mentions WHERE message_id IN (SELECT id FROM messages WHERE task_id = $1)',
      [id],
    )
    await client.query('DELETE FROM messages WHERE task_id = $1', [id])
    await client.query('DELETE FROM subtasks WHERE task_id = $1', [id])
    await client.query('DELETE FROM tasks WHERE id = $1', [id])
    // NOTE: Activity logging moved to task.service.ts (single responsibility)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return true
}

export async function assignTask(
  id: string,
  agentId: string,
  sessionKey?: string,
): Promise<Task | null> {
  const task = await getTaskById(id)
  if (!task) return null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      UPDATE tasks SET assigned_to = $1, status = 'ASSIGNED', session_key = $2
      WHERE id = $3
    `,
      [agentId, sessionKey || null, id],
    )
    // NOTE: Activity logging moved to task.service.ts (single responsibility)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return (await getTaskById(id)) || null
}

export async function moveTask(
  id: string,
  status: TaskStatus,
  _agentId?: string,
): Promise<{ task: Task; oldStatus: TaskStatus } | null> {
  const task = await getTaskById(id)
  if (!task) return null

  const oldStatus = task.status as TaskStatus

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Stamp completed_at when the task lands in a finished column of its
    // workspace (any is_done_state column, not only DONE), clear it when it
    // leaves one.
    await client.query(
      `UPDATE tasks SET status = $1::text, completed_at = ${completedAtSql('$1::text')} WHERE id = $2`,
      [status, id],
    )

    // NOTE: Activity logging moved to task.service.ts (single responsibility)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  const updatedTask = await getTaskById(id)
  return updatedTask ? { task: updatedTask, oldStatus } : null
}
