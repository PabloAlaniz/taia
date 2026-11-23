// Board column repository — dynamic columns per workspace

import type { BoardColumn } from '@taia/types'
import { pool, generateId } from '../pool'

export async function getColumnsForWorkspace(workspaceId: string): Promise<BoardColumn[]> {
  const res = await pool.query(
    'SELECT * FROM board_columns WHERE workspace_id = $1 ORDER BY position ASC',
    [workspaceId],
  )
  return res.rows
}

export async function getColumnById(id: string): Promise<BoardColumn | undefined> {
  const res = await pool.query('SELECT * FROM board_columns WHERE id = $1', [id])
  return res.rows[0]
}

export async function createColumn(
  workspaceId: string,
  data: {
    slug: string
    label: string
    icon?: string
    is_done_state?: boolean
    is_initial_state?: boolean
    color?: string
  },
): Promise<BoardColumn> {
  const id = generateId()
  // Position = max + 1
  const posRes = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM board_columns WHERE workspace_id = $1',
    [workspaceId],
  )
  const position = posRes.rows[0].next_pos

  await pool.query(
    `INSERT INTO board_columns (id, workspace_id, slug, name, label, icon, position, is_done_state, is_initial_state, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      workspaceId,
      data.slug,
      data.label,
      data.label,
      data.icon || null,
      position,
      data.is_done_state || false,
      data.is_initial_state || false,
      data.color || null,
    ],
  )
  return (await getColumnById(id))!
}

export async function updateColumn(
  id: string,
  updates: Partial<
    Pick<BoardColumn, 'label' | 'icon' | 'is_done_state' | 'is_initial_state' | 'color'>
  >,
): Promise<BoardColumn | null> {
  const existing = await getColumnById(id)
  if (!existing) return null

  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(updates)) {
    if (['label', 'icon', 'is_done_state', 'is_initial_state', 'color'].includes(key)) {
      fields.push(`${key} = $${idx++}`)
      values.push(value)
    }
  }

  if (fields.length > 0) {
    values.push(id)
    await pool.query(`UPDATE board_columns SET ${fields.join(', ')} WHERE id = $${idx}`, values)
  }

  return (await getColumnById(id)) ?? null
}

export async function deleteColumn(id: string): Promise<boolean> {
  const res = await pool.query('DELETE FROM board_columns WHERE id = $1', [id])
  return (res.rowCount ?? 0) > 0
}

export async function reorderColumns(workspaceId: string, orderedIds: string[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE board_columns SET position = $1 WHERE id = $2 AND workspace_id = $3',
        [i, orderedIds[i], workspaceId],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Every column's slug and done flag, for one workspace or all of them. */
export async function getColumnStates(
  workspaceId?: string,
): Promise<{ workspace_id: string; slug: string; is_done_state: boolean }[]> {
  const res = workspaceId
    ? await pool.query(
        'SELECT workspace_id, slug, is_done_state FROM board_columns WHERE workspace_id = $1',
        [workspaceId],
      )
    : await pool.query('SELECT workspace_id, slug, is_done_state FROM board_columns')
  return res.rows
}

export async function getDoneStateSlugs(workspaceId: string): Promise<string[]> {
  const res = await pool.query(
    'SELECT slug FROM board_columns WHERE workspace_id = $1 AND is_done_state = TRUE',
    [workspaceId],
  )
  return res.rows.map((r: { slug: string }) => r.slug)
}

export async function getInitialSlug(workspaceId: string): Promise<string | undefined> {
  const res = await pool.query(
    'SELECT slug FROM board_columns WHERE workspace_id = $1 AND is_initial_state = TRUE LIMIT 1',
    [workspaceId],
  )
  return res.rows[0]?.slug
}
