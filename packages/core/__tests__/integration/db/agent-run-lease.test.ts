/**
 * Integration test: agent run leases on a real PostgreSQL.
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

// The repository uses the app pool; point it at the test database.
vi.mock('../../../src/db/pool', async () => {
  const helper = await import('./test-db-helper')
  return { pool: helper.getTestPool() }
})

const repo = await import('../../../src/db/repositories/agent-run-lease.repository')

describe.skipIf(!testDBAvailable)('agent run leases (integration)', () => {
  beforeAll(async () => {
    await dropAllTables()
    await runAllMigrations()
  })

  beforeEach(async () => {
    await getTestPool().query('DELETE FROM agent_run_leases')
  })

  afterAll(async () => {
    await dropAllTables()
    await cleanupTestPool()
  })

  it('lets exactly one of many simultaneous triggers take the lease', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repo.acquireAgentRunLease('agent-1', `lease-${i}`, 300, false),
      ),
    )

    const winners = results.filter((r) => r.acquired)
    expect(winners).toHaveLength(1)
    for (const loser of results.filter((r) => !r.acquired)) {
      expect(loser.lease?.leaseId).toBe(winners[0]!.lease.leaseId)
    }
  })

  it('reports the running session to whoever is turned away', async () => {
    await repo.acquireAgentRunLease('agent-1', 'l1', 300, false)
    await repo.attachAgentRunSession('agent-1', 'l1', 'sess-1', 'run-1')

    const second = await repo.acquireAgentRunLease('agent-1', 'l2', 300, false)

    expect(second).toMatchObject({
      acquired: false,
      lease: { leaseId: 'l1', sessionKey: 'sess-1', runId: 'run-1' },
    })
  })

  it('an expired lease is free, and force takes a live one', async () => {
    await repo.acquireAgentRunLease('agent-1', 'l1', 300, false)
    await getTestPool().query(
      "UPDATE agent_run_leases SET expires_at = now() - interval '1 second'",
    )

    expect((await repo.acquireAgentRunLease('agent-1', 'l2', 300, false)).acquired).toBe(true)
    const forced = await repo.acquireAgentRunLease('agent-1', 'l3', 300, true)
    expect(forced).toMatchObject({ acquired: true, lease: { leaseId: 'l3', sessionKey: null } })
  })

  it('only the holder releases or attaches to the lease', async () => {
    await repo.acquireAgentRunLease('agent-1', 'old', 300, false)
    await repo.acquireAgentRunLease('agent-1', 'new', 300, true)

    await repo.attachAgentRunSession('agent-1', 'old', 'stale', 'stale')
    await repo.releaseAgentRunLease('agent-1', 'old')
    const held = await repo.acquireAgentRunLease('agent-1', 'x', 300, false)
    expect(held).toMatchObject({ acquired: false, lease: { leaseId: 'new', sessionKey: null } })

    await repo.releaseAgentRunLease('agent-1', 'new')
    expect((await repo.acquireAgentRunLease('agent-1', 'y', 300, false)).acquired).toBe(true)
  })

  it('agents do not share a lease', async () => {
    await repo.acquireAgentRunLease('agent-1', 'l1', 300, false)
    expect((await repo.acquireAgentRunLease('agent-2', 'l2', 300, false)).acquired).toBe(true)
  })
})
