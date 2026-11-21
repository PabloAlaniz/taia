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
  generateId: vi.fn(() => 'test-col-123'),
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
  getColumnsForWorkspace,
  getColumnById,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  getDoneStateSlugs,
  getInitialSlug,
} from '@taia/core/db/repositories/board-column.repository'

describe('board-column.repository', () => {
  // ---------------------------------------------------------------
  // getColumnsForWorkspace
  // ---------------------------------------------------------------
  describe('getColumnsForWorkspace', () => {
    it('returns columns ordered by position', async () => {
      const rows = [
        { id: 'col-1', workspace_id: 'ws-1', slug: 'INBOX', position: 0 },
        { id: 'col-2', workspace_id: 'ws-1', slug: 'IN_PROGRESS', position: 1 },
        { id: 'col-3', workspace_id: 'ws-1', slug: 'DONE', position: 2 },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getColumnsForWorkspace('ws-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM board_columns WHERE workspace_id = $1 ORDER BY position ASC',
        ['ws-1'],
      )
      expect(result).toHaveLength(3)
      expect(result[0].slug).toBe('INBOX')
    })

    it('returns empty array for unknown workspace', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getColumnsForWorkspace('unknown')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getColumnById
  // ---------------------------------------------------------------
  describe('getColumnById', () => {
    it('returns column when found', async () => {
      const row = { id: 'col-1', slug: 'INBOX', label: 'Inbox', position: 0 }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getColumnById('col-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM board_columns WHERE id = $1', ['col-1'])
      expect(result).toBeDefined()
      expect(result!.slug).toBe('INBOX')
    })

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getColumnById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createColumn
  // ---------------------------------------------------------------
  describe('createColumn', () => {
    it('auto-calculates position from max + 1', async () => {
      // MAX(position) query
      mockQuery.mockResolvedValueOnce({ rows: [{ next_pos: 3 }] })
      // INSERT query
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getColumnById for return
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-col-123', slug: 'REVIEW', label: 'Review', position: 3 }],
      })

      const result = await createColumn('ws-1', { slug: 'REVIEW', label: 'Review' })

      const insertSql: string = mockQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO board_columns')
      const params = mockQuery.mock.calls[1][1]
      expect(params[0]).toBe('test-col-123') // id
      expect(params[1]).toBe('ws-1') // workspace_id
      expect(params[2]).toBe('REVIEW') // slug
      expect(params[3]).toBe('Review') // name (= label)
      expect(params[4]).toBe('Review') // label
      expect(params[6]).toBe(3) // position
      expect(result.id).toBe('test-col-123')
    })

    it('uses defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-col-123', slug: 'TODO', label: 'To Do', position: 0 }],
      })

      await createColumn('ws-1', { slug: 'TODO', label: 'To Do' })

      const params = mockQuery.mock.calls[1][1]
      expect(params[5]).toBeNull() // icon default
      expect(params[7]).toBe(false) // is_done_state default
      expect(params[8]).toBe(false) // is_initial_state default
      expect(params[9]).toBeNull() // color default
    })

    it('passes provided optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ next_pos: 1 }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'test-col-123', slug: 'DONE', label: 'Done', position: 1, is_done_state: true },
        ],
      })

      await createColumn('ws-1', {
        slug: 'DONE',
        label: 'Done',
        icon: '✅',
        is_done_state: true,
        is_initial_state: false,
        color: '#22c55e',
      })

      const params = mockQuery.mock.calls[1][1]
      expect(params[5]).toBe('✅')
      expect(params[7]).toBe(true)
      expect(params[8]).toBe(false)
      expect(params[9]).toBe('#22c55e')
    })
  })

  // ---------------------------------------------------------------
  // updateColumn
  // ---------------------------------------------------------------
  describe('updateColumn', () => {
    it('updates allowed fields', async () => {
      const existing = { id: 'col-1', slug: 'INBOX', label: 'Inbox', position: 0 }
      mockQuery
        .mockResolvedValueOnce({ rows: [existing] }) // getColumnById (check)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...existing, label: 'New Label' }] }) // getColumnById (return)

      const result = await updateColumn('col-1', { label: 'New Label' })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE board_columns SET')
      expect(updateSql).toContain('label = $1')
      expect(result).toBeDefined()
      expect(result!.label).toBe('New Label')
    })

    it('returns null for non-existent column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await updateColumn('nonexistent', { label: 'Test' })
      expect(result).toBeNull()
    })

    it('does nothing when no valid fields provided', async () => {
      const existing = { id: 'col-1', slug: 'INBOX', label: 'Inbox', position: 0 }
      mockQuery
        .mockResolvedValueOnce({ rows: [existing] }) // getColumnById (check)
        .mockResolvedValueOnce({ rows: [existing] }) // getColumnById (return, no UPDATE)

      const result = await updateColumn('col-1', { slug: 'CHANGED' } as any)

      // Only 2 queries: check + return (no UPDATE because slug is not in allowed fields)
      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(result).toBeDefined()
    })

    it('updates multiple fields at once', async () => {
      const existing = { id: 'col-1', slug: 'TODO', label: 'To Do', is_done_state: false }
      mockQuery
        .mockResolvedValueOnce({ rows: [existing] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...existing, label: 'Done', is_done_state: true, color: '#green' }],
        })

      await updateColumn('col-1', { label: 'Done', is_done_state: true, color: '#green' })

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('label = $1')
      expect(updateSql).toContain('is_done_state = $2')
      expect(updateSql).toContain('color = $3')
    })
  })

  // ---------------------------------------------------------------
  // deleteColumn
  // ---------------------------------------------------------------
  describe('deleteColumn', () => {
    it('returns true on successful deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteColumn('col-1')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM board_columns WHERE id = $1', ['col-1'])
      expect(result).toBe(true)
    })

    it('returns false when column not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteColumn('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // reorderColumns
  // ---------------------------------------------------------------
  describe('reorderColumns', () => {
    it('updates positions in transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await reorderColumns('ws-1', ['col-b', 'col-a', 'col-c'])

      // BEGIN + 3 UPDATEs + COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(5)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[1][1]).toEqual([0, 'col-b', 'ws-1'])
      expect(mockClientQuery.mock.calls[2][1]).toEqual([1, 'col-a', 'ws-1'])
      expect(mockClientQuery.mock.calls[3][1]).toEqual([2, 'col-c', 'ws-1'])
      expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT')
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))

      await expect(reorderColumns('ws-1', ['col-a'])).rejects.toThrow('DB error')
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })

  // ---------------------------------------------------------------
  // getDoneStateSlugs
  // ---------------------------------------------------------------
  describe('getDoneStateSlugs', () => {
    it('returns done state slugs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'DONE' }, { slug: 'ARCHIVED' }] })

      const result = await getDoneStateSlugs('ws-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT slug FROM board_columns WHERE workspace_id = $1 AND is_done_state = TRUE',
        ['ws-1'],
      )
      expect(result).toEqual(['DONE', 'ARCHIVED'])
    })

    it('returns empty array when no done states', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getDoneStateSlugs('ws-1')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getInitialSlug
  // ---------------------------------------------------------------
  describe('getInitialSlug', () => {
    it('returns initial slug', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'INBOX' }] })

      const result = await getInitialSlug('ws-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT slug FROM board_columns WHERE workspace_id = $1 AND is_initial_state = TRUE LIMIT 1',
        ['ws-1'],
      )
      expect(result).toBe('INBOX')
    })

    it('returns undefined when no initial state exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getInitialSlug('ws-1')
      expect(result).toBeUndefined()
    })
  })
})
