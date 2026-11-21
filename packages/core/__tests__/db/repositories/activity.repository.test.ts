import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getActivities,
  getBoardActivities,
  logActivity,
} from '@taia/core/db/repositories/activity.repository'

describe('activity.repository', () => {
  // ---------------------------------------------------------------
  // getActivities
  // ---------------------------------------------------------------
  describe('getActivities', () => {
    it('returns activities ordered by created_at DESC with default limit', async () => {
      const rows = [
        { id: 'act-1', type: 'task_created', message: 'Created task' },
        { id: 'act-2', type: 'task_moved', message: 'Moved task' },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getActivities()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('FROM activities')
      expect(sql).toContain('ORDER BY created_at DESC')
      expect(sql).toContain('LIMIT $1')
      expect(mockQuery.mock.calls[0][1]).toEqual([50])
      expect(result).toEqual(rows)
    })

    it('uses custom limit when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getActivities(10)

      expect(mockQuery.mock.calls[0][1]).toEqual([10])
    })

    it('returns empty array when no activities exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getActivities()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // logActivity
  // ---------------------------------------------------------------
  describe('logActivity', () => {
    it('inserts activity with generated id and returns the row', async () => {
      const activityRow = {
        id: 'test-id-123',
        type: 'task_created',
        agent_id: 'agent-a',
        task_id: 'task-1',
        message: 'Created task',
        metadata: null,
      }
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // SELECT for return
      mockQuery.mockResolvedValueOnce({ rows: [activityRow] })

      const result = await logActivity({
        type: 'task_created',
        agent_id: 'agent-a',
        task_id: 'task-1',
        message: 'Created task',
      })

      expect(mockQuery).toHaveBeenCalledTimes(2)

      // Verify INSERT
      const insertSql: string = mockQuery.mock.calls[0][0]
      expect(insertSql).toContain('INSERT INTO activities')
      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123')
      expect(params[1]).toBe('task_created')
      expect(params[2]).toBe('agent-a')
      expect(params[3]).toBe('task-1')
      expect(params[4]).toBeNull() // workspace_id defaults to null
      expect(params[5]).toBe('Created task')
      expect(params[6]).toBeNull() // no metadata

      // Verify SELECT
      expect(mockQuery.mock.calls[1][0]).toContain('SELECT * FROM activities WHERE id = $1')
      expect(mockQuery.mock.calls[1][1]).toEqual(['test-id-123'])

      expect(result).toEqual(activityRow)
    })

    it('serializes metadata to JSON when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-id-123', type: 'custom', message: 'msg', metadata: '{"key":"val"}' }],
      })

      await logActivity({
        type: 'custom',
        message: 'msg',
        metadata: { key: 'val' },
      })

      const params = mockQuery.mock.calls[0][1]
      expect(params[2]).toBeNull() // agent_id defaults to null
      expect(params[3]).toBeNull() // task_id defaults to null
      expect(params[4]).toBeNull() // workspace_id defaults to null
      expect(params[5]).toBe('msg')
      expect(params[6]).toBe('{"key":"val"}')
    })
  })

  describe('getBoardActivities', () => {
    it('lists the workspace activity plus the entries that belong to no workspace', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1' }] })

      const result = await getBoardActivities(30, 'ws-a')

      const [sql, params] = mockQuery.mock.calls[0]
      expect(sql).toContain('workspace_id = $2 OR workspace_id IS NULL')
      expect(params).toEqual([30, 'ws-a'])
      expect(result).toEqual([{ id: 'a1' }])
    })
  })
})
