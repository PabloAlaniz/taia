import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getColumnSettings,
  getColumnSetting,
  setColumnWipLimit,
  deleteColumnSetting,
} from '@taia/core/db/repositories/column-setting.repository'

describe('column-setting.repository', () => {
  // ---------------------------------------------------------------
  // getColumnSettings
  // ---------------------------------------------------------------
  describe('getColumnSettings', () => {
    it('returns all column settings ordered by column_name', async () => {
      const rows = [
        { id: '1', column_name: 'DONE', wip_limit: null },
        { id: '2', column_name: 'IN_PROGRESS', wip_limit: 3 },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getColumnSettings()

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM column_settings ORDER BY column_name')
      expect(result).toEqual(rows)
    })

    it('returns empty array when no settings exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getColumnSettings()
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getColumnSetting
  // ---------------------------------------------------------------
  describe('getColumnSetting', () => {
    it('returns column setting when found', async () => {
      const row = { id: '1', column_name: 'IN_PROGRESS', wip_limit: 5 }
      mockQuery.mockResolvedValueOnce({ rows: [row] })

      const result = await getColumnSetting('IN_PROGRESS')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM column_settings WHERE column_name = $1',
        ['IN_PROGRESS'],
      )
      expect(result).toEqual(row)
    })

    it('returns undefined when column setting not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getColumnSetting('NONEXISTENT')
      expect(result).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // setColumnWipLimit
  // ---------------------------------------------------------------
  describe('setColumnWipLimit', () => {
    it('updates existing column setting', async () => {
      const existing = { id: '1', column_name: 'IN_PROGRESS', wip_limit: 3 }
      // getColumnSetting (check existence)
      mockQuery.mockResolvedValueOnce({ rows: [existing] })
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getColumnSetting (return)
      mockQuery.mockResolvedValueOnce({ rows: [{ ...existing, wip_limit: 5 }] })

      const result = await setColumnWipLimit('IN_PROGRESS', 5)

      const updateSql: string = mockQuery.mock.calls[1][0]
      expect(updateSql).toContain('UPDATE column_settings SET wip_limit = $1')
      expect(mockQuery.mock.calls[1][1]).toEqual([5, 'IN_PROGRESS'])
      expect(result.wip_limit).toBe(5)
    })

    it('inserts new column setting when not existing', async () => {
      // getColumnSetting (not found)
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // getColumnSetting (return)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'test-id-123', column_name: 'REVIEW', wip_limit: 2 }],
      })

      const result = await setColumnWipLimit('REVIEW', 2)

      const insertSql: string = mockQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO column_settings')
      expect(mockQuery.mock.calls[1][1]).toEqual(['test-id-123', 'REVIEW', 2, null])
      expect(result.column_name).toBe('REVIEW')
      expect(result.wip_limit).toBe(2)
    })

    it('allows setting wip_limit to null', async () => {
      const existing = { id: '1', column_name: 'IN_PROGRESS', wip_limit: 3 }
      mockQuery.mockResolvedValueOnce({ rows: [existing] })
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [{ ...existing, wip_limit: null }] })

      const result = await setColumnWipLimit('IN_PROGRESS', null)

      expect(mockQuery.mock.calls[1][1]).toEqual([null, 'IN_PROGRESS'])
      expect(result.wip_limit).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // deleteColumnSetting
  // ---------------------------------------------------------------
  describe('deleteColumnSetting', () => {
    it('returns true when column setting is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteColumnSetting('IN_PROGRESS')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM column_settings WHERE column_name = $1', [
        'IN_PROGRESS',
      ])
      expect(result).toBe(true)
    })

    it('returns false when column setting not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteColumnSetting('NONEXISTENT')
      expect(result).toBe(false)
    })
  })
})
