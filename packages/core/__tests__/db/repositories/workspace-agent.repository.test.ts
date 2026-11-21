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
  getAgentsForWorkspace,
  getWorkspacesForAgent,
  addAgentToWorkspace,
  removeAgentFromWorkspace,
  setWorkspaceAgents,
} from '@taia/core/db/repositories/workspace-agent.repository'

describe('workspace-agent.repository', () => {
  // ---------------------------------------------------------------
  // getAgentsForWorkspace
  // ---------------------------------------------------------------
  describe('getAgentsForWorkspace', () => {
    it('returns normalized agents for workspace', async () => {
      const rows = [
        { id: 'agent-1', name: 'Alice', enabled: true, config: null },
        { id: 'agent-2', name: 'Bob', enabled: true, config: '{"key":"val"}' },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getAgentsForWorkspace('ws-1')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INNER JOIN workspace_agents')
      expect(sql).toContain('WHERE wa.workspace_id = $1')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('agent-1')
      expect(result[0].enabled).toBe(1)
    })

    it('returns empty array for unknown workspace', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAgentsForWorkspace('unknown')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getWorkspacesForAgent
  // ---------------------------------------------------------------
  describe('getWorkspacesForAgent', () => {
    it('returns workspace IDs for agent', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1' }, { workspace_id: 'ws-2' }],
      })

      const result = await getWorkspacesForAgent('agent-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT workspace_id FROM workspace_agents WHERE agent_id = $1',
        ['agent-1'],
      )
      expect(result).toEqual(['ws-1', 'ws-2'])
    })

    it('returns empty array when agent has no workspaces', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getWorkspacesForAgent('agent-1')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // addAgentToWorkspace
  // ---------------------------------------------------------------
  describe('addAgentToWorkspace', () => {
    it('inserts record with ON CONFLICT DO NOTHING', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await addAgentToWorkspace('ws-1', 'agent-1')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO workspace_agents')
      expect(sql).toContain('ON CONFLICT DO NOTHING')
      expect(mockQuery.mock.calls[0][1]).toEqual(['ws-1', 'agent-1'])
    })
  })

  // ---------------------------------------------------------------
  // removeAgentFromWorkspace
  // ---------------------------------------------------------------
  describe('removeAgentFromWorkspace', () => {
    it('returns true when agent is removed', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await removeAgentFromWorkspace('ws-1', 'agent-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM workspace_agents WHERE workspace_id = $1 AND agent_id = $2',
        ['ws-1', 'agent-1'],
      )
      expect(result).toBe(true)
    })

    it('returns false when record not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await removeAgentFromWorkspace('ws-1', 'nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // setWorkspaceAgents
  // ---------------------------------------------------------------
  describe('setWorkspaceAgents', () => {
    it('replaces agents in transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await setWorkspaceAgents('ws-1', ['agent-a', 'agent-b'])

      // BEGIN + DELETE + 2 INSERTs + COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(5)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[1][0]).toContain('DELETE FROM workspace_agents')
      expect(mockClientQuery.mock.calls[1][1]).toEqual(['ws-1'])
      expect(mockClientQuery.mock.calls[2][1]).toEqual(['ws-1', 'agent-a'])
      expect(mockClientQuery.mock.calls[3][1]).toEqual(['ws-1', 'agent-b'])
      expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT')
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockRejectedValueOnce(new Error('DB error')) // INSERT fails

      await expect(setWorkspaceAgents('ws-1', ['agent-a'])).rejects.toThrow('DB error')
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('handles empty agent list', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await setWorkspaceAgents('ws-1', [])

      // BEGIN + DELETE + COMMIT (no INSERTs)
      expect(mockClientQuery).toHaveBeenCalledTimes(3)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[1][0]).toContain('DELETE FROM workspace_agents')
      expect(mockClientQuery.mock.calls[2][0]).toBe('COMMIT')
    })
  })
})
