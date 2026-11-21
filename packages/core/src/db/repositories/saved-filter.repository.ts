// Saved filter repository — extends CrudRepository with normalize + custom delete

import type { SavedFilter, SavedFilterConfig } from '@taia/types'
import { pool, generateId } from '../pool'
import { CrudRepository } from './base.repository'

function normalizeFilter(row: Record<string, unknown>): SavedFilter {
  return {
    id: row.id as string,
    name: row.name as string,
    icon: (row.icon as string | undefined) || undefined,
    filter_config: (typeof row.filter_config === 'string'
      ? JSON.parse(row.filter_config)
      : row.filter_config) as SavedFilterConfig,
    is_predefined: row.is_predefined as boolean,
    sort_order: row.sort_order as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

class SavedFilterRepository extends CrudRepository<SavedFilter> {
  constructor() {
    super({
      tableName: 'saved_filters',
      updatableFields: ['name', 'icon', 'filter_config'],
      normalize: normalizeFilter,
      serializeField: (key, value) => {
        if (key === 'filter_config' && typeof value === 'object') {
          return JSON.stringify(value)
        }
        return value
      },
    })
  }

  /** Every filter, or the ones a workspace can use: its own plus the predefined ones. */
  async getAll(workspaceId?: string): Promise<SavedFilter[]> {
    const res = workspaceId
      ? await pool.query(
          `SELECT * FROM saved_filters
           WHERE workspace_id = $1 OR is_predefined = TRUE
           ORDER BY sort_order, created_at`,
          [workspaceId],
        )
      : await pool.query('SELECT * FROM saved_filters ORDER BY sort_order, created_at')
    return res.rows.map(normalizeFilter)
  }

  async create(data: {
    name: string
    icon?: string
    filter_config: SavedFilterConfig
    workspace_id?: string
  }): Promise<SavedFilter> {
    const id = generateId()
    const maxRes = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM saved_filters',
    )
    const sortOrder = maxRes.rows[0].next_order

    await pool.query(
      `INSERT INTO saved_filters (id, name, icon, filter_config, is_predefined, sort_order, workspace_id)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [
        id,
        data.name,
        data.icon || null,
        JSON.stringify(data.filter_config),
        sortOrder,
        data.workspace_id || 'ws-default',
      ],
    )
    return (await this.getById(id))!
  }

  /** Override update to enforce non-predefined + add updated_at */
  async update(
    id: string,
    data: Partial<{ name: string; icon: string; filter_config: SavedFilterConfig }>,
  ): Promise<SavedFilter | null> {
    const sets: string[] = ['updated_at = NOW()']
    const values: unknown[] = [id]
    let idx = 2

    if (data.name !== undefined) {
      sets.push(`name = $${idx}`)
      values.push(data.name)
      idx++
    }
    if (data.icon !== undefined) {
      sets.push(`icon = $${idx}`)
      values.push(data.icon)
      idx++
    }
    if (data.filter_config !== undefined) {
      sets.push(`filter_config = $${idx}`)
      values.push(JSON.stringify(data.filter_config))
      // eslint-disable-next-line no-useless-assignment -- defensive: keeps idx in sync if a new branch is added below
      idx++
    }

    await pool.query(
      `UPDATE saved_filters SET ${sets.join(', ')} WHERE id = $1 AND is_predefined = FALSE`,
      values,
    )
    return (await this.getById(id)) ?? null
  }

  /** Override delete to only allow non-predefined filters */
  async delete(id: string): Promise<boolean> {
    const res = await pool.query(
      'DELETE FROM saved_filters WHERE id = $1 AND is_predefined = FALSE',
      [id],
    )
    return (res.rowCount ?? 0) > 0
  }
}

const repo = new SavedFilterRepository()

// Function exports for backward compatibility with facade
export const getAllSavedFilters = (workspaceId?: string): Promise<SavedFilter[]> =>
  repo.getAll(workspaceId)
export const getSavedFilterById = (id: string): Promise<SavedFilter | undefined> => repo.getById(id)
export const createSavedFilter = (data: Parameters<typeof repo.create>[0]): Promise<SavedFilter> =>
  repo.create(data)
export const updateSavedFilter = (
  id: string,
  data: Partial<{ name: string; icon: string; filter_config: SavedFilterConfig }>,
): Promise<SavedFilter | null> => repo.update(id, data)
export const deleteSavedFilter = (id: string): Promise<boolean> => repo.delete(id)
