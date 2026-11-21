// Activity repository — async only

import type { Activity } from '@taia/types'
import { pool, generateId } from '../pool'

/**
 * The feed of one board: the activity of its workspace plus the entries that
 * belong to no workspace (system and agent events), newest first.
 */
export async function getBoardActivities(limit: number, workspaceId: string): Promise<Activity[]> {
  const res = await pool.query(
    `
    SELECT id, type, agent_id, task_id, workspace_id, message, metadata, created_at
    FROM activities
    WHERE workspace_id = $2 OR workspace_id IS NULL
    ORDER BY created_at DESC
    LIMIT $1
  `,
    [limit, workspaceId],
  )
  return res.rows
}

export async function getActivities(limit: number = 50, workspaceId?: string): Promise<Activity[]> {
  if (workspaceId) {
    const res = await pool.query(
      `
      SELECT id, type, agent_id, task_id, workspace_id, message, metadata, created_at
      FROM activities
      WHERE workspace_id = $2
      ORDER BY created_at DESC
      LIMIT $1
    `,
      [limit, workspaceId],
    )
    return res.rows
  }
  const res = await pool.query(
    `
    SELECT id, type, agent_id, task_id, workspace_id, message, metadata, created_at
    FROM activities
    ORDER BY created_at DESC
    LIMIT $1
  `,
    [limit],
  )
  return res.rows
}

export async function logActivity(data: {
  type: string
  agent_id: string
  task_id?: string
  workspace_id?: string
  message: string
  metadata?: Record<string, unknown>
}): Promise<Activity> {
  const id = generateId()

  await pool.query(
    `
    INSERT INTO activities (id, type, agent_id, task_id, workspace_id, message, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `,
    [
      id,
      data.type,
      data.agent_id || null,
      data.task_id || null,
      data.workspace_id || null,
      data.message,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ],
  )

  const res = await pool.query('SELECT * FROM activities WHERE id = $1', [id])
  return res.rows[0]
}
