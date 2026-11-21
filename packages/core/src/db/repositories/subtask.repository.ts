// Subtask repository — extends CrudRepository with normalize + withTransaction

import type { Subtask } from '@taia/types'
import { pool, generateId, normalizeSubtask } from '../pool'
import { CrudRepository } from './base.repository'

class SubtaskRepository extends CrudRepository<Subtask> {
  constructor() {
    super({
      tableName: 'subtasks',
      updatableFields: ['title', 'completed', 'position'],
      normalize: normalizeSubtask,
    })
  }

  async getForTask(taskId: string): Promise<Subtask[]> {
    const res = await pool.query(
      `SELECT id, task_id, title, completed, position, created_at
       FROM subtasks WHERE task_id = $1 ORDER BY position ASC`,
      [taskId],
    )
    return res.rows.map(normalizeSubtask)
  }

  async create(data: { task_id: string; title: string }): Promise<Subtask> {
    const id = generateId()
    const maxPosRes = await pool.query(
      'SELECT MAX(position) as max FROM subtasks WHERE task_id = $1',
      [data.task_id],
    )
    const position = (maxPosRes.rows[0].max ?? -1) + 1

    await pool.query(
      'INSERT INTO subtasks (id, task_id, title, position) VALUES ($1, $2, $3, $4)',
      [id, data.task_id, data.title, position],
    )

    const res = await pool.query('SELECT * FROM subtasks WHERE id = $1', [id])
    return normalizeSubtask(res.rows[0])
  }

  async reorder(taskId: string, subtaskIds: string[]): Promise<void> {
    await this.withTransaction(async (client) => {
      for (let i = 0; i < subtaskIds.length; i++) {
        await client.query('UPDATE subtasks SET position = $1 WHERE id = $2 AND task_id = $3', [
          i,
          subtaskIds[i],
          taskId,
        ])
      }
    })
  }
}

const repo = new SubtaskRepository()

// Function exports for backward compatibility with facade
export const getSubtasksForTask = (taskId: string): Promise<Subtask[]> => repo.getForTask(taskId)
export const getSubtaskById = (id: string): Promise<Subtask | null> =>
  repo.getById(id).then((s) => s ?? null)
export const createSubtask = (data: { task_id: string; title: string }): Promise<Subtask> =>
  repo.create(data)
export const updateSubtask = (
  id: string,
  updates: { title?: string; completed?: boolean; position?: number },
): Promise<Subtask | null> => repo.update(id, updates)
export const deleteSubtask = (id: string): Promise<boolean> => repo.delete(id)
export const reorderSubtasks = (taskId: string, subtaskIds: string[]): Promise<void> =>
  repo.reorder(taskId, subtaskIds)
