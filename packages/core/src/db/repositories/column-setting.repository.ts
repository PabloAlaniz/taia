// Column settings repository — async only

import type { ColumnSetting } from '@taia/types'
import { pool, generateId } from '../pool'

export async function getColumnSettings(workspaceId?: string): Promise<ColumnSetting[]> {
  if (workspaceId) {
    const res = await pool.query(
      'SELECT * FROM column_settings WHERE workspace_id = $1 ORDER BY column_name',
      [workspaceId],
    )
    return res.rows
  }
  const res = await pool.query('SELECT * FROM column_settings ORDER BY column_name')
  return res.rows
}

export async function getColumnSetting(columnName: string): Promise<ColumnSetting | undefined> {
  const res = await pool.query('SELECT * FROM column_settings WHERE column_name = $1', [columnName])
  return res.rows[0]
}

export async function setColumnWipLimit(
  columnName: string,
  wipLimit: number | null,
  workspaceId?: string,
): Promise<ColumnSetting> {
  const existing = await getColumnSetting(columnName)

  if (existing) {
    await pool.query(
      `
      UPDATE column_settings SET wip_limit = $1, updated_at = NOW() WHERE column_name = $2
    `,
      [wipLimit, columnName],
    )
  } else {
    const id = generateId()
    await pool.query(
      `
      INSERT INTO column_settings (id, column_name, wip_limit, workspace_id) VALUES ($1, $2, $3, $4)
    `,
      [id, columnName, wipLimit, workspaceId || null],
    )
  }

  return (await getColumnSetting(columnName))!
}

export async function deleteColumnSetting(columnName: string): Promise<boolean> {
  const res = await pool.query('DELETE FROM column_settings WHERE column_name = $1', [columnName])
  return (res.rowCount ?? 0) > 0
}
