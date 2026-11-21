import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getBlockersForTask,
  getDependentsOfTask,
  addDependency,
  removeDependencyById,
  removeDependency,
  wouldCreateCycle,
  areAllBlockersResolved,
  getUnresolvedBlockerCount,
} from '@taia/core/db/repositories/task-dependency.repository'

describe('task-dependency.repository', () => {
  const depRow = {
    id: 'dep-1',
    task_id: 'task-1',
    depends_on_task_id: 'task-2',
    created_at: '2025-01-15T00:00:00Z',
  }

  // ---------------------------------------------------------------
  // getBlockersForTask
  // ---------------------------------------------------------------
  describe('getBlockersForTask', () => {
    it('returns blocker details with joined task info', async () => {
      const rows = [
        {
          ...depRow,
          depends_on_title: 'Setup infrastructure',
          depends_on_status: 'IN_PROGRESS',
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getBlockersForTask('task-1')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('JOIN tasks t ON t.id = td.depends_on_task_id')
      expect(sql).toContain('WHERE td.task_id = $1')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])

      expect(result).toHaveLength(1)
      expect(result[0].depends_on_title).toBe('Setup infrastructure')
      expect(result[0].depends_on_status).toBe('IN_PROGRESS')
    })

    it('returns empty array when no blockers', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getBlockersForTask('task-1')

      expect(result).toEqual([])
    })

    it('normalizes undefined titles/statuses to undefined', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...depRow, depends_on_title: null, depends_on_status: null }],
      })

      const result = await getBlockersForTask('task-1')

      expect(result[0].depends_on_title).toBeUndefined()
      expect(result[0].depends_on_status).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getDependentsOfTask
  // ---------------------------------------------------------------
  describe('getDependentsOfTask', () => {
    it('returns dependent tasks with joined task info', async () => {
      const rows = [
        {
          ...depRow,
          task_title: 'Deploy to production',
          task_status: 'INBOX',
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getDependentsOfTask('task-2')

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('JOIN tasks t ON t.id = td.task_id')
      expect(sql).toContain('WHERE td.depends_on_task_id = $1')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-2'])

      expect(result).toHaveLength(1)
      expect(result[0].task_title).toBe('Deploy to production')
    })

    it('returns empty array when no dependents', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getDependentsOfTask('task-2')

      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // addDependency
  // ---------------------------------------------------------------
  describe('addDependency', () => {
    it('inserts a dependency and returns it', async () => {
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // SELECT to return
      mockQuery.mockResolvedValueOnce({ rows: [depRow] })

      const result = await addDependency('task-1', 'task-2')

      expect(mockQuery).toHaveBeenCalledTimes(2)

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO task_dependencies')
      expect(sql).toContain('ON CONFLICT (task_id, depends_on_task_id) DO NOTHING')

      const params = mockQuery.mock.calls[0][1]
      expect(params).toEqual(['test-id-123', 'task-1', 'task-2'])

      // Verify the select-back query
      expect(mockQuery.mock.calls[1][0]).toContain('WHERE task_id = $1 AND depends_on_task_id = $2')
      expect(mockQuery.mock.calls[1][1]).toEqual(['task-1', 'task-2'])

      expect(result).toEqual({
        id: 'dep-1',
        task_id: 'task-1',
        depends_on_task_id: 'task-2',
        created_at: '2025-01-15T00:00:00Z',
      })
    })
  })

  // ---------------------------------------------------------------
  // removeDependencyById
  // ---------------------------------------------------------------
  describe('removeDependencyById', () => {
    it('returns true when dependency was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await removeDependencyById('dep-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM task_dependencies WHERE id = $1', [
        'dep-1',
      ])
      expect(result).toBe(true)
    })

    it('returns false when dependency did not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await removeDependencyById('nonexistent')

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // removeDependency
  // ---------------------------------------------------------------
  describe('removeDependency', () => {
    it('removes by task pair and returns true', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await removeDependency('task-1', 'task-2')

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
        ['task-1', 'task-2'],
      )
      expect(result).toBe(true)
    })

    it('returns false when pair does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await removeDependency('task-1', 'task-99')

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // wouldCreateCycle
  // ---------------------------------------------------------------
  describe('wouldCreateCycle', () => {
    it('returns true for self-referencing dependency', async () => {
      // The query still runs, but self-ref is caught before result check
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await wouldCreateCycle('task-1', 'task-1')

      expect(result).toBe(true)
    })

    it('returns true when recursive CTE finds a cycle', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

      const result = await wouldCreateCycle('task-1', 'task-2')

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('WITH RECURSIVE dep_chain')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1', 'task-2'])
      expect(result).toBe(true)
    })

    it('returns false when no cycle would be created', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await wouldCreateCycle('task-1', 'task-2')

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // areAllBlockersResolved
  // ---------------------------------------------------------------
  describe('areAllBlockersResolved', () => {
    it('returns true when pending count is 0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ pending: '0' }] })

      const result = await areAllBlockersResolved('task-1')

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("t.status NOT IN ('DONE', 'REJECTED')")
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])
      expect(result).toBe(true)
    })

    it('returns false when there are pending blockers', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ pending: '2' }] })

      const result = await areAllBlockersResolved('task-1')

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // getUnresolvedBlockerCount
  // ---------------------------------------------------------------
  describe('getUnresolvedBlockerCount', () => {
    it('returns the count of unresolved blockers', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] })

      const result = await getUnresolvedBlockerCount('task-1')

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("t.status NOT IN ('DONE', 'REJECTED')")
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])
      expect(result).toBe(3)
    })

    it('returns 0 when no unresolved blockers', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] })

      const result = await getUnresolvedBlockerCount('task-1')

      expect(result).toBe(0)
    })
  })
})
