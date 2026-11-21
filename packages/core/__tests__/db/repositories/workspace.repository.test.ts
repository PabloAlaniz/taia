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
  getAllWorkspaces,
  getWorkspaceById,
  getWorkspaceBySlug,
  getDefaultWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '@taia/core/db/repositories/workspace.repository'

describe('workspace.repository', () => {
  // ---------------------------------------------------------------
  // getAllWorkspaces
  // ---------------------------------------------------------------
  describe('getAllWorkspaces', () => {
    it('returns workspaces ordered by is_default DESC, name ASC', async () => {
      const rows = [
        { id: 'ws-1', name: 'Default', slug: 'default', is_default: true },
        { id: 'ws-2', name: 'Alpha', slug: 'alpha', is_default: false },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getAllWorkspaces()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('ORDER BY is_default DESC, name ASC')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('ws-1')
    })

    it('returns empty array when no workspaces exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllWorkspaces()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getWorkspaceBySlug
  // ---------------------------------------------------------------
  describe('getWorkspaceBySlug', () => {
    it('returns workspace when found', async () => {
      const row = { id: 'ws-1', name: 'Dev', slug: 'dev', is_default: false }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getWorkspaceBySlug('dev')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM workspaces WHERE slug = $1', ['dev'])
      expect(result).toBeDefined()
      expect(result!.slug).toBe('dev')
    })

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getWorkspaceBySlug('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getDefaultWorkspace
  // ---------------------------------------------------------------
  describe('getDefaultWorkspace', () => {
    it('returns default workspace', async () => {
      const row = { id: 'ws-1', name: 'Default', slug: 'default', is_default: true }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getDefaultWorkspace()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('is_default = TRUE')
      expect(result).toBeDefined()
      expect(result!.is_default).toBe(true)
    })

    it('returns undefined when no default workspace exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getDefaultWorkspace()
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createWorkspace
  // ---------------------------------------------------------------
  describe('createWorkspace', () => {
    it('inserts workspace and returns it via getById', async () => {
      const created = {
        id: 'test-id-123',
        name: 'New WS',
        slug: 'new-ws',
        is_default: false,
        icon: '📋',
        color: '#3b82f6',
      }
      // INSERT query
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getById query (from base repo)
      mockQuery.mockResolvedValueOnce({ rows: [created] })

      const result = await createWorkspace({ name: 'New WS', slug: 'new-ws' })

      const insertSql: string = mockQuery.mock.calls[0][0]
      expect(insertSql).toContain('INSERT INTO workspaces')
      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123')
      expect(params[1]).toBe('New WS')
      expect(params[2]).toBe('new-ws')
      expect(result.id).toBe('test-id-123')
    })

    it('uses default values for icon and color when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-id-123', name: 'WS', slug: 'ws', icon: '📋', color: '#3b82f6' }],
      })

      await createWorkspace({ name: 'WS', slug: 'ws' })

      const params = mockQuery.mock.calls[0][1]
      expect(params[3]).toBeNull() // description
      expect(params[4]).toBe('📋') // icon default
      expect(params[5]).toBe('#3b82f6') // color default
    })

    it('uses provided icon and color', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-id-123', name: 'WS', slug: 'ws', icon: '🚀', color: '#ff0000' }],
      })

      await createWorkspace({
        name: 'WS',
        slug: 'ws',
        icon: '🚀',
        color: '#ff0000',
        description: 'Test',
      })

      const params = mockQuery.mock.calls[0][1]
      expect(params[3]).toBe('Test')
      expect(params[4]).toBe('🚀')
      expect(params[5]).toBe('#ff0000')
    })
  })

  // ---------------------------------------------------------------
  // deleteWorkspace
  // ---------------------------------------------------------------
  describe('deleteWorkspace', () => {
    it('returns false for default workspace', async () => {
      // getById returns a default workspace
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ws-1', name: 'Default', is_default: true }] })

      const result = await deleteWorkspace('ws-1')
      expect(result).toBe(false)
      // Should not have called DELETE
      expect(mockQuery).toHaveBeenCalledTimes(1)
    })

    it('returns true for non-default workspace', async () => {
      // getById returns non-default workspace
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ws-2', name: 'Dev', is_default: false }] })
      // DELETE query
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteWorkspace('ws-2')

      expect(result).toBe(true)
      const deleteSql: string = mockQuery.mock.calls[1][0]
      expect(deleteSql).toContain('DELETE FROM workspaces')
      expect(deleteSql).toContain('is_default = FALSE')
    })

    it('returns false for non-existent workspace', async () => {
      // getById returns nothing
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await deleteWorkspace('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // getWorkspaceById (inherited from CrudRepository)
  // ---------------------------------------------------------------
  describe('getWorkspaceById', () => {
    it('returns workspace when found', async () => {
      const row = { id: 'ws-1', name: 'Dev', slug: 'dev' }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getWorkspaceById('ws-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM workspaces WHERE id = $1', ['ws-1'])
      expect(result).toBeDefined()
      expect(result!.id).toBe('ws-1')
    })

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getWorkspaceById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // updateWorkspace (inherited from CrudRepository)
  // ---------------------------------------------------------------
  describe('updateWorkspace', () => {
    it('updates allowed fields and returns updated workspace', async () => {
      const wsRow = { id: 'ws-1', name: 'Old', slug: 'old', description: null }
      mockQuery
        .mockResolvedValueOnce({ rows: [wsRow] }) // getById (check)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...wsRow, name: 'New' }] }) // getById (return)

      const result = await updateWorkspace('ws-1', { name: 'New' })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE workspaces SET')
      expect(updateSql).toContain('name = $1')
      expect(result).toBeDefined()
      expect(result!.name).toBe('New')
    })

    it('returns null for non-existent workspace', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await updateWorkspace('nonexistent', { name: 'Updated' })
      expect(result).toBeNull()
    })

    it('ignores fields not in updatableFields', async () => {
      const wsRow = { id: 'ws-1', name: 'WS', slug: 'ws' }
      mockQuery
        .mockResolvedValueOnce({ rows: [wsRow] }) // getById (check)
        .mockResolvedValueOnce({ rows: [wsRow] }) // getById (return, no UPDATE because no valid fields)

      const result = await updateWorkspace('ws-1', { slug: 'changed' } as any)

      // No UPDATE query was executed (only 2 queries: check + return)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(result).toBeDefined()
    })
  })
})
