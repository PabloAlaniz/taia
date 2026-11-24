/**
 * Integration test: access tokens on a real PostgreSQL (migration 0009).
 *
 * Requires: pnpm db:test:up (Postgres de test en localhost:5433)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cleanupTestPool,
  dropAllTables,
  getTestPool,
  runAllMigrations,
  testDBAvailable,
} from './test-db-helper'

vi.mock('../../../src/db/pool', async () => {
  const helper = await import('./test-db-helper')
  return { pool: helper.getTestPool() }
})

const service = await import('../../../src/services/access-token.service')

describe.skipIf(!testDBAvailable)('access tokens (integration)', () => {
  beforeAll(async () => {
    await dropAllTables()
    await runAllMigrations()
  })

  beforeEach(async () => {
    await getTestPool().query('DELETE FROM api_tokens')
    service.clearAccessTokenCache()
  })

  afterAll(async () => {
    await dropAllTables()
    await cleanupTestPool()
  })

  it('creates, verifies, lists and revokes a token', async () => {
    const { token, record } = await service.createAccessToken({
      name: 'agent laptop',
      scope: 'agent',
      expiresInDays: 90,
    })

    const { rows } = await getTestPool().query('SELECT token_hash FROM api_tokens WHERE id = $1', [
      record.id,
    ])
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].token_hash).not.toContain(token.split('_')[2])

    expect(await service.verifyAccessToken(token)).toEqual({ id: record.id, scope: 'agent' })
    await vi.waitFor(async () => {
      const used = await getTestPool().query('SELECT last_used_at FROM api_tokens WHERE id = $1', [
        record.id,
      ])
      expect(used.rows[0].last_used_at).not.toBeNull()
    })

    const listed = await service.listAccessTokens()
    expect(listed.map((t) => t.id)).toEqual([record.id])

    await service.revokeAccessToken(record.id)
    expect(await service.verifyAccessToken(token)).toBeNull()
    expect((await service.listAccessTokens())[0].status).toBe('revoked')

    const audited = await getTestPool().query(
      'SELECT operation, resource_type FROM settings_audit_events WHERE setting_key = $1 ORDER BY created_at',
      [`access_token.${record.id}`],
    )
    expect(audited.rows).toEqual([
      { operation: 'create', resource_type: 'api_key' },
      { operation: 'revoke', resource_type: 'api_key' },
    ])
  })

  it('refuses a scope the table does not allow', async () => {
    await expect(
      getTestPool().query(
        "INSERT INTO api_tokens (id, name, scope, token_hash) VALUES ('x', 'x', 'root', 'h')",
      ),
    ).rejects.toThrow()
  })
})
