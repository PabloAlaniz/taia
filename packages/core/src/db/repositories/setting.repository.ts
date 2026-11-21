// Settings repository — async only
//
// Credentials are encrypted at rest when TAIA_SECRET_KEY is set (secret-box.ts).
// Callers always read and write plain values.

import type { Setting } from '@taia/types'
import { pool } from '../pool'
import {
  isEncrypted,
  isSensitiveSettingKey,
  openSecret,
  sealSecret,
  secretEncryptionEnabled,
} from '../../secret-box'

export async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key])
  const value: string | undefined = result.rows[0]?.value
  return value == null ? null : openSecret(key, value)
}

export async function getSettings(prefix?: string): Promise<Setting[]> {
  const result = prefix
    ? await pool.query('SELECT * FROM settings WHERE key LIKE $1 ORDER BY key', [`${prefix}%`])
    : await pool.query('SELECT * FROM settings ORDER BY key')
  return result.rows.map((row: Setting) =>
    typeof row.value === 'string' ? { ...row, value: openSecret(row.key, row.value) } : row,
  )
}

export async function setSetting(key: string, value: string): Promise<void> {
  const stored = isSensitiveSettingKey(key) ? sealSecret(key, value) : value
  await pool.query(
    `
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `,
    [key, stored],
  )
}

export async function deleteSetting(key: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM settings WHERE key = $1', [key])
  return (result.rowCount ?? 0) > 0
}

/**
 * Encrypts the credentials that were stored as plain text before
 * TAIA_SECRET_KEY was set. Returns how many rows it rewrote; does nothing
 * without a key. Safe to run on every start.
 */
export async function encryptStoredSecrets(): Promise<number> {
  if (!secretEncryptionEnabled()) return 0
  const result = await pool.query('SELECT key, value FROM settings')
  let rewritten = 0
  for (const row of result.rows as { key: string; value: string | null }[]) {
    if (!row.value || !isSensitiveSettingKey(row.key) || isEncrypted(row.value)) continue
    // Only touch the row if it still holds the plain value we read.
    const updated = await pool.query(
      'UPDATE settings SET value = $1 WHERE key = $2 AND value = $3',
      [sealSecret(row.key, row.value), row.key, row.value],
    )
    rewritten += updated.rowCount ?? 0
  }
  return rewritten
}
