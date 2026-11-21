// Worktree repository — extends CrudRepository with normalize + custom status update

import type { Worktree, WorktreeStatus } from '@taia/types'
import { pool, generateId } from '../pool'
import { CrudRepository } from './base.repository'

function normalizeWorktree(row: Record<string, unknown>): Worktree {
  return {
    ...(row as object),
    diff_stats: row.diff_stats || undefined,
    worktree_path: row.worktree_path || undefined,
    error_message: row.error_message || undefined,
    created_by: row.created_by || undefined,
  } as Worktree
}

class WorktreeRepository extends CrudRepository<Worktree> {
  constructor() {
    super({
      tableName: 'worktrees',
      updatableFields: ['status', 'worktree_path', 'diff_stats', 'error_message'],
      normalize: normalizeWorktree,
      serializeField: (key, value) => {
        if (key === 'diff_stats' && typeof value === 'object') return JSON.stringify(value)
        return value
      },
    })
  }

  async getForTask(taskId: string): Promise<Worktree[]> {
    const res = await pool.query(
      'SELECT * FROM worktrees WHERE task_id = $1 ORDER BY created_at DESC',
      [taskId],
    )
    return res.rows.map(normalizeWorktree)
  }

  async getActiveForTask(taskId: string): Promise<Worktree | undefined> {
    const res = await pool.query(
      `SELECT * FROM worktrees
       WHERE task_id = $1 AND status NOT IN ('merged', 'failed', 'cleanup')
       ORDER BY created_at DESC LIMIT 1`,
      [taskId],
    )
    return res.rows[0] ? normalizeWorktree(res.rows[0]) : undefined
  }

  async getByStatus(status: WorktreeStatus): Promise<Worktree[]> {
    const res = await pool.query(
      'SELECT * FROM worktrees WHERE status = $1 ORDER BY created_at DESC',
      [status],
    )
    return res.rows.map(normalizeWorktree)
  }

  async getAllActive(): Promise<Worktree[]> {
    const res = await pool.query(
      `SELECT * FROM worktrees
       WHERE status NOT IN ('merged', 'failed', 'cleanup')
       ORDER BY created_at DESC`,
    )
    return res.rows.map(normalizeWorktree)
  }

  async create(data: {
    task_id: string
    repository_id: string
    branch_name: string
    base_branch?: string
    merge_strategy?: string
    created_by?: string
  }): Promise<Worktree> {
    const id = generateId()
    await pool.query(
      `INSERT INTO worktrees (id, task_id, repository_id, branch_name, base_branch, merge_strategy, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        data.task_id,
        data.repository_id,
        data.branch_name,
        data.base_branch || 'main',
        data.merge_strategy || 'squash',
        data.created_by || null,
      ],
    )
    return (await this.getById(id))!
  }

  async updateStatus(
    id: string,
    status: WorktreeStatus,
    extra?: {
      worktree_path?: string
      diff_stats?: unknown
      error_message?: string
    },
  ): Promise<Worktree | undefined> {
    const sets = ['status = $2', 'updated_at = NOW()']
    const values: unknown[] = [id, status]
    let idx = 3

    if (extra?.worktree_path !== undefined) {
      sets.push(`worktree_path = $${idx}`)
      values.push(extra.worktree_path)
      idx++
    }
    if (extra?.diff_stats !== undefined) {
      sets.push(`diff_stats = $${idx}`)
      values.push(JSON.stringify(extra.diff_stats))
      idx++
    }
    if (extra?.error_message !== undefined) {
      sets.push(`error_message = $${idx}`)
      values.push(extra.error_message)
      // eslint-disable-next-line no-useless-assignment -- defensive: keeps idx in sync if a new branch is added below
      idx++
    }

    await pool.query(`UPDATE worktrees SET ${sets.join(', ')} WHERE id = $1`, values)

    return this.getById(id)
  }
}

const repo = new WorktreeRepository()

// Function exports for backward compatibility with facade
export const getWorktreeById = (id: string): Promise<Worktree | undefined> => repo.getById(id)
export const getWorktreesForTask = (taskId: string): Promise<Worktree[]> => repo.getForTask(taskId)
export const getActiveWorktreeForTask = (taskId: string): Promise<Worktree | undefined> =>
  repo.getActiveForTask(taskId)
export const getWorktreesByStatus = (status: WorktreeStatus): Promise<Worktree[]> =>
  repo.getByStatus(status)
export const getAllActiveWorktrees = (): Promise<Worktree[]> => repo.getAllActive()
export const createWorktreeRecord = (data: Parameters<typeof repo.create>[0]): Promise<Worktree> =>
  repo.create(data)
export const updateWorktreeStatus = (
  id: string,
  status: WorktreeStatus,
  extra?: Parameters<typeof repo.updateStatus>[2],
): Promise<Worktree | undefined> => repo.updateStatus(id, status, extra)
export const deleteWorktreeRecord = (id: string): Promise<boolean> => repo.delete(id)
