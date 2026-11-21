import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getWorktreeById,
  getWorktreesForTask,
  getActiveWorktreeForTask,
  getWorktreesByStatus,
  getAllActiveWorktrees,
  createWorktreeRecord,
  updateWorktreeStatus,
  deleteWorktreeRecord,
} from '@taia/core/db/repositories/worktree.repository'

describe('worktree.repository', () => {
  const rawRow = {
    id: 'wt-1',
    task_id: 'task-1',
    repository_id: 'repo-1',
    branch_name: 'agent/bot-a/task-abc',
    base_branch: 'main',
    status: 'created',
    merge_strategy: 'squash',
    worktree_path: '/tmp/worktrees/wt-1',
    diff_stats: null,
    error_message: null,
    created_by: 'bot-a',
    created_at: '2025-01-15T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  }

  // ---------------------------------------------------------------
  // getWorktreeById
  // ---------------------------------------------------------------
  describe('getWorktreeById', () => {
    it('returns normalized worktree when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getWorktreeById('wt-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM worktrees WHERE id = $1', ['wt-1'])
      expect(result).toBeDefined()
      expect(result!.id).toBe('wt-1')
      expect(result!.worktree_path).toBe('/tmp/worktrees/wt-1')
    })

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getWorktreeById('nonexistent')

      expect(result).toBeUndefined()
    })

    it('normalizes null optional fields to undefined', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...rawRow,
            diff_stats: null,
            worktree_path: null,
            error_message: null,
            created_by: null,
          },
        ],
      })

      const result = await getWorktreeById('wt-1')

      expect(result!.diff_stats).toBeUndefined()
      expect(result!.worktree_path).toBeUndefined()
      expect(result!.error_message).toBeUndefined()
      expect(result!.created_by).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getWorktreesForTask
  // ---------------------------------------------------------------
  describe('getWorktreesForTask', () => {
    it('returns worktrees for a task ordered by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow, { ...rawRow, id: 'wt-2' }] })

      const result = await getWorktreesForTask('task-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM worktrees WHERE task_id = $1 ORDER BY created_at DESC',
        ['task-1'],
      )
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no worktrees for task', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getWorktreesForTask('task-empty')

      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getActiveWorktreeForTask
  // ---------------------------------------------------------------
  describe('getActiveWorktreeForTask', () => {
    it('returns the most recent active worktree', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getActiveWorktreeForTask('task-1')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("status NOT IN ('merged', 'failed', 'cleanup')")
      expect(sql).toContain('LIMIT 1')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])
      expect(result).toBeDefined()
    })

    it('returns undefined when no active worktree exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getActiveWorktreeForTask('task-1')

      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getWorktreesByStatus
  // ---------------------------------------------------------------
  describe('getWorktreesByStatus', () => {
    it('returns worktrees filtered by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getWorktreesByStatus('created')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM worktrees WHERE status = $1 ORDER BY created_at DESC',
        ['created'],
      )
      expect(result).toHaveLength(1)
    })

    it('returns empty array when no worktrees match status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getWorktreesByStatus('merged')

      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getAllActiveWorktrees
  // ---------------------------------------------------------------
  describe('getAllActiveWorktrees', () => {
    it('returns all worktrees not in terminal states', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getAllActiveWorktrees()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("status NOT IN ('merged', 'failed', 'cleanup')")
      expect(result).toHaveLength(1)
    })
  })

  // ---------------------------------------------------------------
  // createWorktreeRecord
  // ---------------------------------------------------------------
  describe('createWorktreeRecord', () => {
    it('inserts a worktree and returns the created record', async () => {
      // First: INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // Second: getWorktreeById (SELECT)
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, id: 'test-id-123' }] })

      const result = await createWorktreeRecord({
        task_id: 'task-1',
        repository_id: 'repo-1',
        branch_name: 'agent/bot-a/task-abc',
        created_by: 'bot-a',
      })

      expect(mockQuery).toHaveBeenCalledTimes(2)

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO worktrees')

      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123') // generated id
      expect(params[1]).toBe('task-1')
      expect(params[2]).toBe('repo-1')
      expect(params[3]).toBe('agent/bot-a/task-abc')
      expect(params[4]).toBe('main') // default base_branch
      expect(params[5]).toBe('squash') // default merge_strategy
      expect(params[6]).toBe('bot-a')

      expect(result.id).toBe('test-id-123')
    })

    it('uses defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, id: 'test-id-123' }] })

      await createWorktreeRecord({
        task_id: 'task-1',
        repository_id: 'repo-1',
        branch_name: 'feature/branch',
      })

      const params = mockQuery.mock.calls[0][1]
      expect(params[4]).toBe('main') // base_branch default
      expect(params[5]).toBe('squash') // merge_strategy default
      expect(params[6]).toBeNull() // created_by default
    })
  })

  // ---------------------------------------------------------------
  // updateWorktreeStatus
  // ---------------------------------------------------------------
  describe('updateWorktreeStatus', () => {
    it('updates status only and returns updated worktree', async () => {
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getWorktreeById
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...rawRow, status: 'active' }],
      })

      const result = await updateWorktreeStatus('wt-1', 'active')

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('UPDATE worktrees SET')
      expect(sql).toContain('status = $2')
      expect(sql).toContain('updated_at = NOW()')

      const params = mockQuery.mock.calls[0][1]
      expect(params).toEqual(['wt-1', 'active'])

      expect(result!.status).toBe('active')
    })

    it('includes worktree_path, diff_stats, and error_message when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      await updateWorktreeStatus('wt-1', 'active', {
        worktree_path: '/tmp/new-path',
        diff_stats: { files: 3, insertions: 10, deletions: 2 },
        error_message: 'something went wrong',
      })

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('worktree_path = $3')
      expect(sql).toContain('diff_stats = $4')
      expect(sql).toContain('error_message = $5')

      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('wt-1')
      expect(params[1]).toBe('active')
      expect(params[2]).toBe('/tmp/new-path')
      expect(params[3]).toBe(JSON.stringify({ files: 3, insertions: 10, deletions: 2 }))
      expect(params[4]).toBe('something went wrong')
    })
  })

  // ---------------------------------------------------------------
  // deleteWorktreeRecord
  // ---------------------------------------------------------------
  describe('deleteWorktreeRecord', () => {
    it('returns true when a row was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteWorktreeRecord('wt-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM worktrees WHERE id = $1', ['wt-1'])
      expect(result).toBe(true)
    })

    it('returns false when no row was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteWorktreeRecord('nonexistent')

      expect(result).toBe(false)
    })

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null })

      const result = await deleteWorktreeRecord('wt-1')

      expect(result).toBe(false)
    })
  })
})
