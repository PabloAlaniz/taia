// Agent repository — extends CrudRepository with serializeField + withTransaction

import type { AgentRecord, AgentType } from '@taia/types'
import { pool, normalizeAgent } from '../pool'
import { CrudRepository } from './base.repository'

class AgentRepository extends CrudRepository<AgentRecord> {
  constructor() {
    super({
      tableName: 'agents',
      updatableFields: ['name', 'role', 'avatar', 'enabled', 'type', 'config', 'sort_order'],
      normalize: normalizeAgent,
      serializeField: (key, value) => {
        if (key === 'config' && typeof value === 'object') return JSON.stringify(value)
        if (key === 'enabled') return value === 1 || value === true
        return value
      },
    })
  }

  async getAll(includeDisabled = false): Promise<AgentRecord[]> {
    const sql = includeDisabled
      ? 'SELECT * FROM agents ORDER BY sort_order ASC'
      : 'SELECT * FROM agents WHERE enabled = true ORDER BY sort_order ASC'
    const res = await pool.query(sql)
    return res.rows.map(normalizeAgent)
  }

  async create(data: {
    id: string
    name: string
    role?: string
    avatar?: string
    type?: AgentType
    config?: Record<string, unknown>
  }): Promise<AgentRecord> {
    const maxOrderRes = await pool.query('SELECT MAX(sort_order) as max FROM agents')
    const sortOrder = (maxOrderRes.rows[0].max ?? -1) + 1

    await pool.query(
      `INSERT INTO agents (id, name, role, avatar, type, config, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.id,
        data.name,
        data.role || null,
        data.avatar || '🤖',
        data.type || 'cron',
        data.config ? JSON.stringify(data.config) : null,
        sortOrder,
      ],
    )

    return (await this.getById(data.id))!
  }

  async reorder(orderedIds: string[]): Promise<void> {
    await this.withTransaction(async (client) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query('UPDATE agents SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]])
      }
    })
  }
}

const repo = new AgentRepository()

// Function exports for backward compatibility with facade
export const getAllAgents = (includeDisabled = false): Promise<AgentRecord[]> =>
  repo.getAll(includeDisabled)
export const getAgentById = (id: string): Promise<AgentRecord | undefined> => repo.getById(id)
export const createAgent = (data: Parameters<typeof repo.create>[0]): Promise<AgentRecord> =>
  repo.create(data)
export const updateAgent = (
  id: string,
  updates: Partial<Omit<AgentRecord, 'id' | 'created_at'>>,
): Promise<AgentRecord | null> => repo.update(id, updates)
export const deleteAgent = (id: string): Promise<boolean> => repo.delete(id)
export const reorderAgents = (orderedIds: string[]): Promise<void> => repo.reorder(orderedIds)
