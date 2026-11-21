// Tag color repository — persistent color assignments for tags

import { pool } from '../pool'

export interface TagColor {
  tag: string
  color: string
}

/** Get all tag colors as a map */
export async function getAllTagColors(): Promise<Record<string, string>> {
  const res = await pool.query('SELECT tag, color FROM tag_colors ORDER BY tag')
  const map: Record<string, string> = {}
  for (const row of res.rows) {
    map[row.tag] = row.color
  }
  return map
}

/** Get color for a specific tag */
export async function getTagColor(tag: string): Promise<string | null> {
  const res = await pool.query('SELECT color FROM tag_colors WHERE tag = $1', [tag])
  return res.rows[0]?.color ?? null
}

/** Set color for a tag (upsert) */
export async function setTagColor(tag: string, color: string): Promise<void> {
  await pool.query(
    `INSERT INTO tag_colors (tag, color) VALUES ($1, $2)
     ON CONFLICT (tag) DO UPDATE SET color = $2`,
    [tag, color],
  )
}

/** Remove color assignment for a tag */
export async function deleteTagColor(tag: string): Promise<void> {
  await pool.query('DELETE FROM tag_colors WHERE tag = $1', [tag])
}

/** Bulk set colors (used for batch updates) */
export async function setTagColors(colors: Record<string, string>): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [tag, color] of Object.entries(colors)) {
      await client.query(
        `INSERT INTO tag_colors (tag, color) VALUES ($1, $2)
         ON CONFLICT (tag) DO UPDATE SET color = $2`,
        [tag, color],
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
