import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockClientQuery = vi.fn()
const mockClientRelease = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: vi.fn(async () => ({
      query: (...args: any[]) => mockClientQuery(...args),
      release: mockClientRelease,
    })),
  },
  generateId: vi.fn(() => 'test-id-123'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getAllTagColors,
  getTagColor,
  setTagColor,
  deleteTagColor,
  setTagColors,
} from '@taia/core/db/repositories/tag-color.repository'

describe('tag-color.repository', () => {
  // ---------------------------------------------------------------
  // getAllTagColors
  // ---------------------------------------------------------------
  describe('getAllTagColors', () => {
    it('returns a map of tag to color', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { tag: 'bug', color: 'red' },
          { tag: 'feature', color: 'blue' },
        ],
      })

      const result = await getAllTagColors()

      expect(mockQuery).toHaveBeenCalledWith('SELECT tag, color FROM tag_colors ORDER BY tag')
      expect(result).toEqual({ bug: 'red', feature: 'blue' })
    })

    it('returns empty object when no tag colors exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getAllTagColors()

      expect(result).toEqual({})
    })
  })

  // ---------------------------------------------------------------
  // getTagColor
  // ---------------------------------------------------------------
  describe('getTagColor', () => {
    it('returns the color for a specific tag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ color: 'green' }] })

      const result = await getTagColor('urgent')

      expect(mockQuery).toHaveBeenCalledWith('SELECT color FROM tag_colors WHERE tag = $1', [
        'urgent',
      ])
      expect(result).toBe('green')
    })

    it('returns null when tag has no color', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getTagColor('nonexistent')

      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // setTagColor
  // ---------------------------------------------------------------
  describe('setTagColor', () => {
    it('upserts a tag color', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await setTagColor('bug', 'red')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO tag_colors')
      expect(sql).toContain('ON CONFLICT (tag) DO UPDATE')
      expect(mockQuery.mock.calls[0][1]).toEqual(['bug', 'red'])
    })
  })

  // ---------------------------------------------------------------
  // deleteTagColor
  // ---------------------------------------------------------------
  describe('deleteTagColor', () => {
    it('deletes a tag color', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await deleteTagColor('bug')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM tag_colors WHERE tag = $1', ['bug'])
    })
  })

  // ---------------------------------------------------------------
  // setTagColors (bulk / transactional)
  // ---------------------------------------------------------------
  describe('setTagColors', () => {
    it('inserts multiple tag colors within a transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await setTagColors({ bug: 'red', feature: 'blue', docs: 'green' })

      // BEGIN + 3 upserts + COMMIT = 5 calls
      expect(mockClientQuery).toHaveBeenCalledTimes(5)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[4][0]).toBe('COMMIT')

      // Verify the upsert calls
      for (let i = 1; i <= 3; i++) {
        expect(mockClientQuery.mock.calls[i][0]).toContain('INSERT INTO tag_colors')
        expect(mockClientQuery.mock.calls[i][0]).toContain('ON CONFLICT (tag) DO UPDATE')
      }
      expect(mockClientRelease).toHaveBeenCalledOnce()
    })

    it('rolls back on error and rethrows', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')) // first upsert fails

      await expect(setTagColors({ bug: 'red' })).rejects.toThrow('DB error')

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClientRelease).toHaveBeenCalledOnce()
    })

    it('handles empty colors map (no-op transaction)', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] })

      await setTagColors({})

      // BEGIN + COMMIT only
      expect(mockClientQuery).toHaveBeenCalledTimes(2)
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      expect(mockClientQuery.mock.calls[1][0]).toBe('COMMIT')
      expect(mockClientRelease).toHaveBeenCalledOnce()
    })
  })
})
