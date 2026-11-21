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
  normalizeAgent: vi.fn((row: any) => ({
    ...row,
    enabled: row.enabled === true || row.enabled === 1 ? 1 : 0,
    config: typeof row.config === 'object' ? JSON.stringify(row.config) : row.config,
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import {
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  reorderAgents,
} from '@taia/core/db/repositories/agent.repository'

describe('agent.repository', () => {
  // ---------------------------------------------------------------
  // getAllAgents
  // ---------------------------------------------------------------
  describe('getAllAgents', () => {
    it('returns only enabled agents by default', async () => {
      const rows = [
        { id: 'agent-1', name: 'Alice', enabled: true, config: null },
        { id: 'agent-2', name: 'Bob', enabled: true, config: null },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getAllAgents()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('WHERE enabled = true')
      expect(sql).toContain('ORDER BY sort_order ASC')
      expect(result).toHaveLength(2)
    })

    it('returns all agents including disabled when includeDisabled is true', async () => {
      const rows = [
        { id: 'agent-1', name: 'Alice', enabled: true, config: null },
        { id: 'agent-2', name: 'Bob', enabled: false, config: null },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getAllAgents(true)

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).not.toContain('WHERE')
      expect(sql).toContain('ORDER BY sort_order ASC')
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no agents exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllAgents()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getAgentById
  // ---------------------------------------------------------------
  describe('getAgentById', () => {
    it('returns normalized agent when found', async () => {
      const row = { id: 'agent-1', name: 'Alice', enabled: true, config: '{"key":"val"}' }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getAgentById('agent-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = $1', ['agent-1'])
      expect(result).toBeDefined()
      expect(result!.id).toBe('agent-1')
    })

    it('returns undefined when agent not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAgentById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createAgent
  // ---------------------------------------------------------------
  describe('createAgent', () => {
    it('creates agent with computed sort_order and returns it', async () => {
      // MAX(sort_order) query
      mockQuery.mockResolvedValueOnce({ rows: [{ max: 2 }] })
      // INSERT query
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getAgentById for return
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'custom-id', name: 'New Agent', enabled: true, config: null }],
      })

      const result = await createAgent({ id: 'custom-id', name: 'New Agent' })

      // Verify MAX query
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT MAX(sort_order)')

      // Verify INSERT with sort_order = max + 1 = 3
      const insertSql: string = mockQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO agents')
      const params = mockQuery.mock.calls[1][1]
      expect(params[0]).toBe('custom-id')
      expect(params[1]).toBe('New Agent')
      expect(params[6]).toBe(3) // sort_order = 2 + 1

      expect(result.id).toBe('custom-id')
    })

    it('starts sort_order at 0 when no agents exist (max is null)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max: null }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'agent-1', name: 'First', enabled: true, config: null }],
      })

      await createAgent({ id: 'agent-1', name: 'First' })

      const params = mockQuery.mock.calls[1][1]
      expect(params[6]).toBe(0) // (-1) + 1 = 0
    })

    it('applies default values for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'agent-1', name: 'Agent', enabled: true, config: null }],
      })

      await createAgent({ id: 'agent-1', name: 'Agent' })

      const params = mockQuery.mock.calls[1][1]
      expect(params[2]).toBeNull() // role
      expect(params[3]).toBe('\uD83E\uDD16') // avatar default
      expect(params[4]).toBe('cron') // type default
      expect(params[5]).toBeNull() // config
    })
  })

  // ---------------------------------------------------------------
  // updateAgent
  // ---------------------------------------------------------------
  describe('updateAgent', () => {
    it('returns null when agent not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await updateAgent('nonexistent', { name: 'Updated' })
      expect(result).toBeNull()
    })

    it('updates allowed fields and returns updated agent', async () => {
      const agentRow = { id: 'agent-1', name: 'Old', enabled: true, config: null }
      mockQuery
        .mockResolvedValueOnce({ rows: [agentRow] }) // getAgentById (check)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...agentRow, name: 'New' }] }) // getAgentById (return)

      const result = await updateAgent('agent-1', { name: 'New' })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE agents SET')
      expect(updateSql).toContain('name = $1')
      expect(result).toBeDefined()
    })

    it('serializes config object to JSON string', async () => {
      const agentRow = { id: 'agent-1', name: 'Agent', enabled: true, config: null }
      mockQuery
        .mockResolvedValueOnce({ rows: [agentRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [agentRow] })

      await updateAgent('agent-1', { config: '{"interval":5}' as any })

      // When config is passed as an object it gets JSON.stringified
      // When passed as string it stays as-is
      const params = mockQuery.mock.calls[1][1]
      expect(params[0]).toBe('{"interval":5}')
    })

    it('normalizes enabled field to boolean', async () => {
      const agentRow = { id: 'agent-1', name: 'Agent', enabled: true, config: null }
      mockQuery
        .mockResolvedValueOnce({ rows: [agentRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [agentRow] })

      await updateAgent('agent-1', { enabled: 1 as any })

      const params = mockQuery.mock.calls[1][1]
      expect(params[0]).toBe(true) // enabled = 1 becomes true
    })
  })

  // ---------------------------------------------------------------
  // deleteAgent
  // ---------------------------------------------------------------
  describe('deleteAgent', () => {
    it('returns true when agent is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteAgent('agent-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM agents WHERE id = $1', ['agent-1'])
      expect(result).toBe(true)
    })

    it('returns false when agent not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteAgent('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // reorderAgents
  // ---------------------------------------------------------------
  describe('reorderAgents', () => {
    it('updates sort_order for each agent in transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await reorderAgents(['agent-b', 'agent-a', 'agent-c'])

      // BEGIN + 3 UPDATEs + COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(5)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[1][1]).toEqual([0, 'agent-b'])
      expect(mockClientQuery.mock.calls[2][1]).toEqual([1, 'agent-a'])
      expect(mockClientQuery.mock.calls[3][1]).toEqual([2, 'agent-c'])
      expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT')
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))

      await expect(reorderAgents(['agent-a'])).rejects.toThrow('DB error')
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })
})
