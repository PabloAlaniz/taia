import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockClientQuery = vi.fn()
const mockRelease = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: vi.fn(() => ({
      query: mockClientQuery,
      release: mockRelease,
    })),
  },
  generateId: vi.fn(() => 'test-id-123'),
  normalizeSubtask: vi.fn((row: any) => ({
    ...row,
    completed: Boolean(row.completed),
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import {
  getSubtasksForTask,
  getSubtaskById,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
} from '@taia/core/db/repositories/subtask.repository'

describe('subtask.repository', () => {
  // ---------------------------------------------------------------
  // getSubtasksForTask
  // ---------------------------------------------------------------
  describe('getSubtasksForTask', () => {
    it('returns subtasks ordered by position ASC', async () => {
      const rows = [
        { id: 'sub-1', task_id: 'task-1', title: 'Step 1', completed: false, position: 0 },
        { id: 'sub-2', task_id: 'task-1', title: 'Step 2', completed: true, position: 1 },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getSubtasksForTask('task-1')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('FROM subtasks')
      expect(sql).toContain('WHERE task_id = $1')
      expect(sql).toContain('ORDER BY position ASC')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])
      expect(result).toHaveLength(2)
      expect(result[0].completed).toBe(false)
      expect(result[1].completed).toBe(true)
    })

    it('returns empty array when no subtasks exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSubtasksForTask('task-empty')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getSubtaskById
  // ---------------------------------------------------------------
  describe('getSubtaskById', () => {
    it('returns normalized subtask when found', async () => {
      const row = { id: 'sub-1', task_id: 'task-1', title: 'Step 1', completed: 1 }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getSubtaskById('sub-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM subtasks WHERE id = $1', ['sub-1'])
      expect(result).toBeDefined()
      expect(result!.completed).toBe(true) // normalized
    })

    it('returns null when subtask not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSubtaskById('nonexistent')
      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // createSubtask
  // ---------------------------------------------------------------
  describe('createSubtask', () => {
    it('creates subtask with auto-incremented position', async () => {
      // MAX(position) query
      mockQuery.mockResolvedValueOnce({ rows: [{ max: 2 }] })
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // SELECT for return
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id-123',
            task_id: 'task-1',
            title: 'New step',
            completed: false,
            position: 3,
          },
        ],
      })

      const result = await createSubtask({ task_id: 'task-1', title: 'New step' })

      // MAX query
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT MAX(position)')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])

      // INSERT with position = max + 1 = 3
      const insertSql: string = mockQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO subtasks')
      const params = mockQuery.mock.calls[1][1]
      expect(params[0]).toBe('test-id-123')
      expect(params[1]).toBe('task-1')
      expect(params[2]).toBe('New step')
      expect(params[3]).toBe(3) // position

      expect(result.id).toBe('test-id-123')
    })

    it('starts at position 0 when no subtasks exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max: null }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'test-id-123', task_id: 'task-1', title: 'First', completed: false, position: 0 },
        ],
      })

      await createSubtask({ task_id: 'task-1', title: 'First' })

      const params = mockQuery.mock.calls[1][1]
      expect(params[3]).toBe(0) // (-1) + 1 = 0
    })
  })

  // ---------------------------------------------------------------
  // updateSubtask
  // ---------------------------------------------------------------
  describe('updateSubtask', () => {
    it('returns null when subtask not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await updateSubtask('nonexistent', { title: 'Updated' })
      expect(result).toBeNull()
    })

    it('updates title and returns the subtask', async () => {
      const row = { id: 'sub-1', task_id: 'task-1', title: 'Old', completed: false, position: 0 }
      mockQuery
        .mockResolvedValueOnce({ rows: [row] }) // check existence
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...row, title: 'New' }] }) // SELECT for return

      const result = await updateSubtask('sub-1', { title: 'New' })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE subtasks SET')
      expect(updateSql).toContain('title = $1')
      expect(mockQuery.mock.calls[1][1]).toEqual(['New', 'sub-1'])
      expect(result).toBeDefined()
    })

    it('updates completed status', async () => {
      const row = { id: 'sub-1', task_id: 'task-1', title: 'Step', completed: false, position: 0 }
      mockQuery
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...row, completed: true }] })

      await updateSubtask('sub-1', { completed: true })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('completed = $1')
      expect(mockQuery.mock.calls[1][1]).toEqual([true, 'sub-1'])
    })

    it('does not issue UPDATE when no fields provided', async () => {
      const row = { id: 'sub-1', task_id: 'task-1', title: 'Step', completed: false, position: 0 }
      mockQuery
        .mockResolvedValueOnce({ rows: [row] }) // check existence
        .mockResolvedValueOnce({ rows: [row] }) // SELECT for return (no UPDATE issued)

      const result = await updateSubtask('sub-1', {})

      // Only 2 queries: check existence + final SELECT (no UPDATE)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(result).toBeDefined()
    })
  })

  // ---------------------------------------------------------------
  // deleteSubtask
  // ---------------------------------------------------------------
  describe('deleteSubtask', () => {
    it('returns true when subtask is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteSubtask('sub-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM subtasks WHERE id = $1', ['sub-1'])
      expect(result).toBe(true)
    })

    it('returns false when subtask not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteSubtask('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // reorderSubtasks
  // ---------------------------------------------------------------
  describe('reorderSubtasks', () => {
    it('updates positions for each subtask in transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await reorderSubtasks('task-1', ['sub-c', 'sub-a', 'sub-b'])

      // BEGIN + 3 UPDATEs + COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(5)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[1][0]).toContain(
        'UPDATE subtasks SET position = $1 WHERE id = $2 AND task_id = $3',
      )
      expect(mockClientQuery.mock.calls[1][1]).toEqual([0, 'sub-c', 'task-1'])
      expect(mockClientQuery.mock.calls[2][1]).toEqual([1, 'sub-a', 'task-1'])
      expect(mockClientQuery.mock.calls[3][1]).toEqual([2, 'sub-b', 'task-1'])
      expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT')
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))

      await expect(reorderSubtasks('task-1', ['sub-a'])).rejects.toThrow('DB error')
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })
})
