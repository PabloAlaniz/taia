/**
 * Integration test: omnilimit's Postgres store on the schema TAIA migrates.
 *
 * Two limiters on two pools stand for the web app and the MCP server: they
 * share one count, which an in-memory store could not do.
 *
 * Requires: pnpm db:test:up (Postgres de test en localhost:5433)
 */

import { Pool } from 'pg'
import { createLimiter } from 'omnilimit'
import { postgresStore } from 'omnilimit/postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cleanupTestPool,
  dropAllTables,
  getTestPool,
  runAllMigrations,
  testDBAvailable,
} from './test-db-helper'

describe.skipIf(!testDBAvailable)('omnilimit Postgres store (integration)', () => {
  let other: Pool

  beforeAll(async () => {
    await dropAllTables()
    await runAllMigrations()
    other = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL || 'postgresql://taia_test:test@localhost:5433/taia_test',
    })
  })

  afterAll(async () => {
    await other.end()
    await dropAllTables()
    await cleanupTestPool()
  })

  const limiterOn = (pool: Pool) =>
    createLimiter({
      store: postgresStore(pool),
      scope: 'shared',
      limit: 2,
      windowMs: 60_000,
      onStoreError: 'closed',
    })

  it('counts in one table shared by every process', async () => {
    const web = limiterOn(getTestPool())
    const mcp = limiterOn(other)

    expect((await web.check('agent-1')).allowed).toBe(true)
    expect((await mcp.check('agent-1')).allowed).toBe(true)
    const denied = await web.check('agent-1')

    expect(denied).toMatchObject({ allowed: false, status: 429, reason: 'limited' })
    expect((await mcp.check('agent-2')).allowed).toBe(true)
  })

  it('peeks, reserves, refunds and resets', async () => {
    const limiter = limiterOn(getTestPool())

    const { reservation } = await limiter.reserve('r')
    expect(await limiter.refund(reservation)).toBe(true)
    // Given back at once, the reservation leaves no trace.
    expect((await limiter.peek('r')).remaining).toBe(2)
    await limiter.check('r')
    await limiter.check('r')
    expect((await limiter.peek('r')).allowed).toBe(false)
    expect(await limiter.reset('r')).toBe(true)
    expect((await limiter.peek('r')).allowed).toBe(true)
  })

  it('cleans up expired rows', async () => {
    const store = postgresStore(getTestPool())
    await getTestPool().query('UPDATE omnilimit_state SET expires_at_ms = 0')

    expect(await store.cleanup()).toBeGreaterThan(0)
    const { rows } = await getTestPool().query('SELECT count(*)::int AS n FROM omnilimit_state')
    expect(rows[0].n).toBe(0)
  })
})
