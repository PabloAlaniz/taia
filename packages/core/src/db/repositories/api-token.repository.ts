// Access tokens (migration 0009). Only hashes are stored; see access/token-format.ts.

import { pool } from '../pool'

export type ApiTokenScope = 'admin' | 'agent'

export interface ApiTokenRecord {
  id: string
  name: string
  scope: ApiTokenScope
  tokenHash: string
  createdBy: string
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
}

interface ApiTokenRow {
  id: string
  name: string
  scope: ApiTokenScope
  token_hash: string
  created_by: string
  created_at: Date
  last_used_at: Date | null
  expires_at: Date | null
  revoked_at: Date | null
}

const toRecord = (row: ApiTokenRow): ApiTokenRecord => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  tokenHash: row.token_hash,
  createdBy: row.created_by,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
})

export async function insertApiToken(input: {
  id: string
  name: string
  scope: ApiTokenScope
  tokenHash: string
  createdBy: string
  expiresAt: Date | null
}): Promise<ApiTokenRecord> {
  const result = await pool.query<ApiTokenRow>(
    `INSERT INTO api_tokens (id, name, scope, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.id, input.name, input.scope, input.tokenHash, input.createdBy, input.expiresAt],
  )
  return toRecord(result.rows[0])
}

export async function findApiToken(id: string): Promise<ApiTokenRecord | null> {
  const result = await pool.query<ApiTokenRow>('SELECT * FROM api_tokens WHERE id = $1', [id])
  return result.rows[0] ? toRecord(result.rows[0]) : null
}

/** Every token, newest first, revoked ones included. */
export async function listApiTokens(): Promise<ApiTokenRecord[]> {
  const result = await pool.query<ApiTokenRow>('SELECT * FROM api_tokens ORDER BY created_at DESC')
  return result.rows.map(toRecord)
}

/** Marks the token revoked; false if it doesn't exist or already was. */
export async function revokeApiToken(id: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [id],
  )
  return (result.rowCount ?? 0) > 0
}

export async function touchApiToken(id: string): Promise<void> {
  await pool.query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [id])
}
