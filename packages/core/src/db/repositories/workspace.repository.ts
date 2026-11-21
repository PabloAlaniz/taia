// Workspace repository — CRUD for workspaces

import type { Workspace } from '@taia/types'
import { pool, generateId } from '../pool'
import { CrudRepository } from './base.repository'

class WorkspaceRepository extends CrudRepository<Workspace> {
  constructor() {
    super({
      tableName: 'workspaces',
      updatableFields: ['name', 'description', 'icon', 'color'],
    })
  }

  async getAll(): Promise<Workspace[]> {
    const res = await pool.query('SELECT * FROM workspaces ORDER BY is_default DESC, name ASC')
    return res.rows
  }

  async getBySlug(slug: string): Promise<Workspace | undefined> {
    const res = await pool.query('SELECT * FROM workspaces WHERE slug = $1', [slug])
    return res.rows[0]
  }

  async getDefault(): Promise<Workspace | undefined> {
    const res = await pool.query('SELECT * FROM workspaces WHERE is_default = TRUE LIMIT 1')
    return res.rows[0]
  }

  async create(data: {
    name: string
    slug: string
    description?: string
    icon?: string
    color?: string
  }): Promise<Workspace> {
    const id = generateId()
    await pool.query(
      `INSERT INTO workspaces (id, name, slug, description, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        data.name,
        data.slug,
        data.description || null,
        data.icon || '📋',
        data.color || '#3b82f6',
      ],
    )
    return (await this.getById(id))!
  }

  async delete(id: string): Promise<boolean> {
    // Prevent deleting the default workspace
    const ws = await this.getById(id)
    if (!ws || ws.is_default) return false
    const res = await pool.query('DELETE FROM workspaces WHERE id = $1 AND is_default = FALSE', [
      id,
    ])
    return (res.rowCount ?? 0) > 0
  }
}

const repo = new WorkspaceRepository()

export const getAllWorkspaces = (): Promise<Workspace[]> => repo.getAll()
export const getWorkspaceById = (id: string): Promise<Workspace | undefined> => repo.getById(id)
export const getWorkspaceBySlug = (slug: string): Promise<Workspace | undefined> =>
  repo.getBySlug(slug)
export const getDefaultWorkspace = (): Promise<Workspace | undefined> => repo.getDefault()
export const createWorkspace = (data: {
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
}): Promise<Workspace> => repo.create(data)
export const updateWorkspace = (
  id: string,
  updates: Partial<Pick<Workspace, 'name' | 'description' | 'icon' | 'color'>>,
): Promise<Workspace | null> => repo.update(id, updates)
export const deleteWorkspace = (id: string): Promise<boolean> => repo.delete(id)
