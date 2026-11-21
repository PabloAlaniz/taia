import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}))

beforeEach(() => vi.clearAllMocks())

import {
  getSetting,
  getSettings,
  setSetting,
  deleteSetting,
  encryptStoredSecrets,
} from '@taia/core/db/repositories/setting.repository'
import { sealSecret } from '@taia/core/secret-box'

describe('setting.repository', () => {
  // ---------------------------------------------------------------
  // getSetting
  // ---------------------------------------------------------------
  describe('getSetting', () => {
    it('returns the value when key exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'dark' }] })

      const result = await getSetting('theme')

      expect(mockQuery).toHaveBeenCalledWith('SELECT value FROM settings WHERE key = $1', ['theme'])
      expect(result).toBe('dark')
    })

    it('returns null when key does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSetting('nonexistent')
      expect(result).toBeNull()
    })

    it('returns null when value field is missing from row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{}] })

      const result = await getSetting('broken')
      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // getSettings
  // ---------------------------------------------------------------
  describe('getSettings', () => {
    it('returns all settings ordered by key when no prefix', async () => {
      const rows = [
        { key: 'archive.days', value: '30' },
        { key: 'theme', value: 'dark' },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getSettings()

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM settings ORDER BY key')
      expect(result).toEqual(rows)
    })

    it('filters by prefix using LIKE when prefix is provided', async () => {
      const rows = [{ key: 'archive.days', value: '30' }]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getSettings('archive')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM settings WHERE key LIKE $1 ORDER BY key',
        ['archive%'],
      )
      expect(result).toEqual(rows)
    })

    it('returns empty array when no settings match', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getSettings('nonexistent')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // setSetting
  // ---------------------------------------------------------------
  describe('setSetting', () => {
    it('upserts setting value with ON CONFLICT', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await setSetting('theme', 'light')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO settings')
      expect(sql).toContain('ON CONFLICT(key) DO UPDATE')
      expect(mockQuery.mock.calls[0][1]).toEqual(['theme', 'light'])
    })
  })

  // ---------------------------------------------------------------
  // deleteSetting
  // ---------------------------------------------------------------
  describe('deleteSetting', () => {
    it('returns true when setting is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await deleteSetting('theme')

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM settings WHERE key = $1', ['theme'])
      expect(result).toBe(true)
    })

    it('returns false when setting not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await deleteSetting('nonexistent')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // Encryption at rest (TAIA_SECRET_KEY)
  // ---------------------------------------------------------------
  describe('with TAIA_SECRET_KEY', () => {
    const TOKEN_KEY = 'runtime.instances.default.token'

    beforeEach(() => {
      process.env.TAIA_SECRET_KEY = 'a-test-key-that-is-long-enough'
    })

    afterEach(() => {
      delete process.env.TAIA_SECRET_KEY
    })

    it('stores credentials encrypted and reads them back', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })
      await setSetting(TOKEN_KEY, 'gw-secret')

      const stored = mockQuery.mock.calls[0][1][1] as string
      expect(stored).toMatch(/^enc:v1:/)
      expect(stored).not.toContain('gw-secret')

      mockQuery.mockResolvedValueOnce({ rows: [{ value: stored }] })
      expect(await getSetting(TOKEN_KEY)).toBe('gw-secret')

      mockQuery.mockResolvedValueOnce({ rows: [{ key: TOKEN_KEY, value: stored }] })
      expect(await getSettings('runtime.')).toEqual([{ key: TOKEN_KEY, value: 'gw-secret' }])
    })

    it('leaves non-sensitive settings as plain text', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })
      await setSetting('ui.theme', 'dark')

      expect(mockQuery.mock.calls[0][1]).toEqual(['ui.theme', 'dark'])
    })

    it('encrypts credentials that were stored before the key was set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: TOKEN_KEY, value: 'plain-token' },
          { key: 'ui.theme', value: 'dark' },
          { key: 'anthropic.api_key', value: sealSecret('anthropic.api_key', 'already') },
          { key: 'empty.token', value: '' },
        ],
      })
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      expect(await encryptStoredSecrets()).toBe(1)

      expect(mockQuery).toHaveBeenCalledTimes(2)
      const [sql, params] = mockQuery.mock.calls[1]
      expect(sql).toContain('UPDATE settings')
      expect(params[0]).toMatch(/^enc:v1:/)
      expect(params.slice(1)).toEqual([TOKEN_KEY, 'plain-token'])
    })
  })

  it('encryptStoredSecrets does nothing without a key', async () => {
    expect(await encryptStoredSecrets()).toBe(0)
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
