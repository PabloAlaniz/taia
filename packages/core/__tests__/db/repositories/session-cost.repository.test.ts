import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  upsertSessionCost,
  getSessionCost,
  getTaskCost,
  getTaskSessionCosts,
  getAgentCostSummary,
  getCostDashboard,
  getLatestSessionUpdatedAt,
} from '@taia/core/db/repositories/session-cost.repository'

describe('session-cost.repository', () => {
  // ---------------------------------------------------------------
  // upsertSessionCost
  // ---------------------------------------------------------------
  describe('upsertSessionCost', () => {
    const input = {
      session_key: 'sess-1',
      agent_id: 'agent-a',
      task_id: 'task-1',
      model: 'claude-opus-4-20250514',
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500,
      estimated_cost_usd: 0.045,
      session_updated_at: 1700000000000,
    }

    it('calls pool.query with INSERT ON CONFLICT and returns the row', async () => {
      const row = { id: 'test-id-123', ...input }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await upsertSessionCost(input)

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO session_costs')
      expect(sql).toContain('ON CONFLICT (session_key) DO UPDATE')
      expect(sql).toContain('RETURNING *')

      // Verify params (cache_creation/read are at positions 8/9)
      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123') // generated id
      expect(params[1]).toBe('sess-1')
      expect(params[2]).toBe('agent-a')
      expect(params[3]).toBe('task-1')
      expect(params[4]).toBe('claude-opus-4-20250514')
      expect(params[5]).toBe(1000)
      expect(params[6]).toBe(500)
      expect(params[7]).toBe(1500)
      expect(params[8]).toBe(0) // cache_creation_input_tokens default
      expect(params[9]).toBe(0) // cache_read_input_tokens default
      expect(params[10]).toBe(0.045)
      expect(params[11]).toBe(1700000000000)

      expect(result).toEqual(row)
    })

    it('passes null for task_id when not provided', async () => {
      const noTask = { ...input, task_id: undefined }
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'test-id-123', ...noTask }] })

      await upsertSessionCost(noTask)

      const params = mockQuery.mock.calls[0][1]
      expect(params[3]).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // getSessionCost
  // ---------------------------------------------------------------
  describe('getSessionCost', () => {
    it('returns the row when found', async () => {
      const row = { session_key: 'sess-1', agent_id: 'agent-a' }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getSessionCost('sess-1')

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE session_key = $1'), [
        'sess-1',
      ])
      expect(result).toEqual(row)
    })

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSessionCost('nonexistent')
      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // getTaskCost
  // ---------------------------------------------------------------
  describe('getTaskCost', () => {
    it('returns numeric totals from string DB values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_tokens: '50000', total_cost_usd: '0.300000', session_count: '3' }],
      })

      const result = await getTaskCost('task-1')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM session_costs WHERE task_id = $1'),
        ['task-1'],
      )
      expect(result).toEqual({
        total_tokens: 50000,
        total_cost_usd: 0.3,
        session_count: 3,
      })
    })

    it('returns zeros when no sessions exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_tokens: '0', total_cost_usd: '0', session_count: '0' }],
      })

      const result = await getTaskCost('task-empty')
      expect(result.total_tokens).toBe(0)
      expect(result.total_cost_usd).toBe(0)
      expect(result.session_count).toBe(0)
    })
  })

  // ---------------------------------------------------------------
  // getTaskSessionCosts
  // ---------------------------------------------------------------
  describe('getTaskSessionCosts', () => {
    it('returns array of SessionCost rows ordered by created_at DESC', async () => {
      const rows = [
        { id: '1', session_key: 'sess-2', task_id: 'task-1' },
        { id: '2', session_key: 'sess-1', task_id: 'task-1' },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getTaskSessionCosts('task-1')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE task_id = $1 ORDER BY created_at DESC'),
        ['task-1'],
      )
      expect(result).toEqual(rows)
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getTaskSessionCosts('task-empty')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getAgentCostSummary
  // ---------------------------------------------------------------
  describe('getAgentCostSummary', () => {
    it('returns totals and by_model breakdown without since', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_tokens: '100000', total_cost_usd: '1.500000', session_count: '5' }],
        })
        .mockResolvedValueOnce({
          rows: [
            { model: 'claude-opus-4-20250514', tokens: '80000', cost_usd: '1.200000' },
            { model: 'claude-sonnet-4-20250514', tokens: '20000', cost_usd: '0.300000' },
          ],
        })

      const result = await getAgentCostSummary('agent-a')

      expect(mockQuery).toHaveBeenCalledTimes(2)

      // First call: totals query
      expect(mockQuery.mock.calls[0][0]).toContain('SUM(total_tokens)')
      expect(mockQuery.mock.calls[0][1]).toEqual(['agent-a'])

      // Second call: by model query
      expect(mockQuery.mock.calls[1][0]).toContain('GROUP BY model')
      expect(mockQuery.mock.calls[1][1]).toEqual(['agent-a'])

      expect(result).toEqual({
        agent_id: 'agent-a',
        total_tokens: 100000,
        total_cost_usd: 1.5,
        session_count: 5,
        // cache_hit_rate defaults to 0 when no cached tokens are present.
        cache_hit_rate: 0,
        by_model: [
          { model: 'claude-opus-4-20250514', tokens: 80000, cost_usd: 1.2 },
          { model: 'claude-sonnet-4-20250514', tokens: 20000, cost_usd: 0.3 },
        ],
      })
    })

    it('passes since date as ISO string in params', async () => {
      const since = new Date('2025-01-01T00:00:00Z')

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_tokens: '0', total_cost_usd: '0', session_count: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] })

      await getAgentCostSummary('agent-b', since)

      // Both queries should include the since param
      expect(mockQuery.mock.calls[0][0]).toContain('created_at >= $2')
      expect(mockQuery.mock.calls[0][1]).toEqual(['agent-b', '2025-01-01T00:00:00.000Z'])
      expect(mockQuery.mock.calls[1][1]).toEqual(['agent-b', '2025-01-01T00:00:00.000Z'])
    })

    it('returns empty by_model when no model rows', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_tokens: '0', total_cost_usd: '0', session_count: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] })

      const result = await getAgentCostSummary('agent-c')
      expect(result.by_model).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getCostDashboard
  // ---------------------------------------------------------------
  describe('getCostDashboard', () => {
    it('returns full metrics without since filter', async () => {
      // 1. totals
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_tokens: '200000', total_cost_usd: '3.000000', session_count: '10' }],
      })
      // 2. by model
      mockQuery.mockResolvedValueOnce({
        rows: [{ model: 'claude-opus-4-20250514', tokens: '200000', cost_usd: '3.000000' }],
      })
      // 3. by agent
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_id: 'agent-a',
            total_tokens: '200000',
            total_cost_usd: '3.000000',
            session_count: '10',
          },
        ],
      })
      // 4. by agent+model
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_id: 'agent-a',
            model: 'claude-opus-4-20250514',
            tokens: '200000',
            cost_usd: '3.000000',
          },
        ],
      })
      // 5. daily trend
      mockQuery.mockResolvedValueOnce({
        rows: [{ date: '2025-01-15', tokens: '50000', cost_usd: '0.750000' }],
      })

      const result = await getCostDashboard()

      expect(mockQuery).toHaveBeenCalledTimes(5)

      expect(result.totals).toEqual({
        total_tokens: 200000,
        total_cost_usd: 3,
        session_count: 10,
        // cache_hit_rate defaults to 0 when no cached tokens are present.
        cache_hit_rate: 0,
      })
      expect(result.by_model).toEqual([
        { model: 'claude-opus-4-20250514', tokens: 200000, cost_usd: 3 },
      ])
      expect(result.by_agent).toHaveLength(1)
      expect(result.by_agent[0].agent_id).toBe('agent-a')
      expect(result.by_agent[0].by_model).toEqual([
        { model: 'claude-opus-4-20250514', tokens: 200000, cost_usd: 3 },
      ])
      expect(result.daily_trend).toEqual([{ date: '2025-01-15', tokens: 50000, cost_usd: 0.75 }])
    })

    it('includes WHERE clause when since is provided', async () => {
      const since = new Date('2025-06-01T00:00:00Z')

      // Provide all 5 mock responses
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_tokens: '0', total_cost_usd: '0', session_count: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      await getCostDashboard(since)

      // All 5 queries should contain the WHERE clause
      for (let i = 0; i < 5; i++) {
        expect(mockQuery.mock.calls[i][0]).toContain('created_at >= $1')
        expect(mockQuery.mock.calls[i][1]).toEqual(['2025-06-01T00:00:00.000Z'])
      }
    })

    it('handles daily_trend with Date objects from the DB', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_tokens: '0', total_cost_usd: '0', session_count: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ date: new Date('2025-01-15T00:00:00Z'), tokens: '1000', cost_usd: '0.01' }],
        })

      const result = await getCostDashboard()
      expect(result.daily_trend[0].date).toBe('2025-01-15')
    })

    it('returns empty by_model for agents with no model breakdown', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_tokens: '100', total_cost_usd: '0.01', session_count: '1' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              agent_id: 'agent-x',
              total_tokens: '100',
              total_cost_usd: '0.01',
              session_count: '1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // no agent+model rows
        .mockResolvedValueOnce({ rows: [] })

      const result = await getCostDashboard()
      expect(result.by_agent[0].by_model).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getLatestSessionUpdatedAt
  // ---------------------------------------------------------------
  describe('getLatestSessionUpdatedAt', () => {
    it('returns the max session_updated_at as a number', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ latest: '1700000000000' }] })

      const result = await getLatestSessionUpdatedAt()

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT MAX(session_updated_at) as latest FROM session_costs',
      )
      expect(result).toBe(1700000000000)
    })

    it('returns 0 when no rows exist (latest is null)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ latest: null }] })

      const result = await getLatestSessionUpdatedAt()
      expect(result).toBe(0)
    })

    it('returns 0 when rows array is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{}] })

      const result = await getLatestSessionUpdatedAt()
      expect(result).toBe(0)
    })
  })
})
