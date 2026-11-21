// Repository repository — extends CrudRepository with normalize + withTransaction for is_primary

import type { Repository } from '@taia/types'
import { pool, generateId } from '../pool'
import { CrudRepository } from './base.repository'

function normalizeRepo(row: Record<string, unknown>): Repository {
  return {
    ...(row as object),
    is_primary: Boolean(row.is_primary),
  } as Repository
}

class RepositoryRepository extends CrudRepository<Repository> {
  constructor() {
    super({
      tableName: 'repositories',
      updatableFields: ['name', 'url', 'is_primary'],
      normalize: normalizeRepo,
    })
  }

  async getForProject(projectId: string): Promise<Repository[]> {
    const res = await pool.query(
      'SELECT * FROM repositories WHERE project_id = $1 ORDER BY is_primary DESC, name ASC',
      [projectId],
    )
    return res.rows.map(normalizeRepo)
  }

  async getPrimary(projectId: string): Promise<Repository | undefined> {
    const res = await pool.query(
      'SELECT * FROM repositories WHERE project_id = $1 AND is_primary = TRUE LIMIT 1',
      [projectId],
    )
    return res.rows[0] ? normalizeRepo(res.rows[0]) : undefined
  }

  async create(data: {
    project_id: string
    name: string
    url: string
    is_primary?: boolean
  }): Promise<Repository> {
    const id = generateId()
    await this.withTransaction(async (client) => {
      if (data.is_primary) {
        await client.query(
          'UPDATE repositories SET is_primary = FALSE WHERE project_id = $1 AND is_primary = TRUE',
          [data.project_id],
        )
      }
      await client.query(
        'INSERT INTO repositories (id, project_id, name, url, is_primary) VALUES ($1, $2, $3, $4, $5)',
        [id, data.project_id, data.name, data.url, data.is_primary ?? false],
      )
    })
    return (await this.getById(id))!
  }

  /** Override update to handle is_primary exclusivity within a transaction */
  async update(
    id: string,
    updates: Partial<Pick<Repository, 'name' | 'url' | 'is_primary'>>,
  ): Promise<Repository | null> {
    const repo = await this.getById(id)
    if (!repo) return null

    await this.withTransaction(async (client) => {
      if (updates.is_primary === true) {
        await client.query(
          'UPDATE repositories SET is_primary = FALSE WHERE project_id = $1 AND is_primary = TRUE AND id != $2',
          [repo.project_id, id],
        )
      }

      const sets: string[] = []
      const values: unknown[] = []
      let paramIndex = 1

      for (const [key, value] of Object.entries(updates)) {
        if (this.config.updatableFields.includes(key)) {
          sets.push(`${key} = $${paramIndex}`)
          values.push(value)
          paramIndex++
        }
      }

      if (sets.length > 0) {
        values.push(id)
        await client.query(
          `UPDATE repositories SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
          values,
        )
      }
    })

    return (await this.getById(id)) ?? null
  }
}

const repo = new RepositoryRepository()

// Function exports for backward compatibility with facade
export const getRepositoriesForProject = (projectId: string): Promise<Repository[]> =>
  repo.getForProject(projectId)
export const getRepositoryById = (id: string): Promise<Repository | undefined> => repo.getById(id)
export const getPrimaryRepository = (projectId: string): Promise<Repository | undefined> =>
  repo.getPrimary(projectId)
export const createRepository = (data: Parameters<typeof repo.create>[0]): Promise<Repository> =>
  repo.create(data)
export const updateRepository = (
  id: string,
  updates: Partial<Pick<Repository, 'name' | 'url' | 'is_primary'>>,
): Promise<Repository | null> => repo.update(id, updates)
export const deleteRepository = (id: string): Promise<boolean> => repo.delete(id)
