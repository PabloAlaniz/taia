import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getAllSavedFilters,
  getSavedFilterById,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
} from '@taia/core/db/repositories/saved-filter.repository'

describe('saved-filter.repository', () => {
  const filterConfig = { statuses: ['INBOX', 'IN_PROGRESS'], agents: [] }

  const rawRow = {
    id: 'filter-1',
    name: 'Active Tasks',
    icon: 'inbox',
    filter_config: JSON.stringify(filterConfig),
    is_predefined: true,
    sort_order: 1,
    created_at: '2025-01-15T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  }

  // ---------------------------------------------------------------
  // getAllSavedFilters
  // ---------------------------------------------------------------
  describe('getAllSavedFilters', () => {
    it('returns normalized filters ordered by sort_order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getAllSavedFilters()

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM saved_filters ORDER BY sort_order, created_at',
      )
      expect(result).toHaveLength(1)
      expect(result[0].filter_config).toEqual(filterConfig)
      expect(result[0].icon).toBe('inbox')
    })

    it('returns empty array when no filters exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllSavedFilters()

      expect(result).toEqual([])
    })

    it('parses filter_config from string to object', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...rawRow, filter_config: '{"statuses":["DONE"]}' }],
      })

      const result = await getAllSavedFilters()

      expect(result[0].filter_config).toEqual({ statuses: ['DONE'] })
    })

    it('handles filter_config already as an object (not string)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...rawRow, filter_config: filterConfig }],
      })

      const result = await getAllSavedFilters()

      expect(result[0].filter_config).toEqual(filterConfig)
    })
  })

  // ---------------------------------------------------------------
  // getSavedFilterById
  // ---------------------------------------------------------------
  describe('getSavedFilterById', () => {
    it('returns the normalized filter when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      const result = await getSavedFilterById('filter-1')

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM saved_filters WHERE id = $1', [
        'filter-1',
      ])
      expect(result).toBeDefined()
      expect(result!.name).toBe('Active Tasks')
    })

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSavedFilterById('nonexistent')

      expect(result).toBeUndefined()
    })

    it('normalizes null icon to undefined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, icon: null }] })

      const result = await getSavedFilterById('filter-1')

      expect(result!.icon).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // createSavedFilter
  // ---------------------------------------------------------------
  describe('createSavedFilter', () => {
    it('gets next sort order, inserts, and returns the created filter', async () => {
      // MAX sort_order query
      mockQuery.mockResolvedValueOnce({ rows: [{ next_order: 6 }] })
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getSavedFilterById (SELECT)
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...rawRow, id: 'test-id-123', is_predefined: false, sort_order: 6 }],
      })

      const result = await createSavedFilter({
        name: 'My Filter',
        icon: 'star',
        filter_config: filterConfig,
      })

      expect(mockQuery).toHaveBeenCalledTimes(3)

      // Verify MAX query
      expect(mockQuery.mock.calls[0][0]).toContain('MAX(sort_order)')

      // Verify INSERT
      const insertSql: string = mockQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO saved_filters')
      const params = mockQuery.mock.calls[1][1]
      expect(params[0]).toBe('test-id-123') // generated id
      expect(params[1]).toBe('My Filter')
      expect(params[2]).toBe('star')
      expect(params[3]).toBe(JSON.stringify(filterConfig))
      expect(params[4]).toBe(6) // sort_order

      expect(result.id).toBe('test-id-123')
    })

    it('uses null for icon when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ next_order: 1 }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [{ ...rawRow, id: 'test-id-123' }] })

      await createSavedFilter({ name: 'No Icon', filter_config: filterConfig })

      const params = mockQuery.mock.calls[1][1]
      expect(params[2]).toBeNull() // icon
    })
  })

  // ---------------------------------------------------------------
  // updateSavedFilter
  // ---------------------------------------------------------------
  describe('updateSavedFilter', () => {
    it('updates name, icon, and filter_config for non-predefined filters', async () => {
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getSavedFilterById
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...rawRow, name: 'Updated', is_predefined: false }],
      })

      const newConfig = { statuses: ['DONE'] }
      const result = await updateSavedFilter('filter-1', {
        name: 'Updated',
        icon: 'check',
        filter_config: newConfig,
      })

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('UPDATE saved_filters SET')
      expect(sql).toContain('updated_at = NOW()')
      expect(sql).toContain('name = $2')
      expect(sql).toContain('icon = $3')
      expect(sql).toContain('filter_config = $4')
      expect(sql).toContain('is_predefined = FALSE')

      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('filter-1') // id
      expect(params[1]).toBe('Updated')
      expect(params[2]).toBe('check')
      expect(params[3]).toBe(JSON.stringify(newConfig))

      expect(result).toBeDefined()
    })

    it('only updates provided fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [rawRow] })

      await updateSavedFilter('filter-1', { name: 'New Name' })

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('name = $2')
      expect(sql).not.toContain('icon =')
      expect(sql).not.toContain('filter_config =')

      const params = mockQuery.mock.calls[0][1]
      expect(params).toEqual(['filter-1', 'New Name'])
    })
  })

  // ---------------------------------------------------------------
  // deleteSavedFilter
  // ---------------------------------------------------------------
  describe('deleteSavedFilter', () => {
    it('deletes non-predefined filter and returns true', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteSavedFilter('filter-custom')

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM saved_filters WHERE id = $1 AND is_predefined = FALSE',
        ['filter-custom'],
      )
      expect(result).toBe(true)
    })

    it('returns false when filter is predefined (rowCount 0)', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteSavedFilter('filter-predefined')

      expect(result).toBe(false)
    })

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null })

      const result = await deleteSavedFilter('filter-1')

      expect(result).toBe(false)
    })
  })

  describe('workspace scope', () => {
    it('lists the filters of a workspace plus the predefined ones', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await getAllSavedFilters('ws-a')

      const [sql, params] = mockQuery.mock.calls[0]
      expect(sql).toContain('workspace_id = $1 OR is_predefined = TRUE')
      expect(params).toEqual(['ws-a'])
    })

    it('stores the workspace of a new filter', async () => {
      mockQuery.mockResolvedValue({ rows: [{ next_order: 3, id: 'f1', filter_config: {} }] })

      await createSavedFilter({ name: 'Mine', filter_config: {}, workspace_id: 'ws-a' })

      const insert = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT'))!
      expect(insert[1].at(-1)).toBe('ws-a')
    })
  })
})
