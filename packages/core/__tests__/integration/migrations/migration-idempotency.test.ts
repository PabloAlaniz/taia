/**
 * Integration test: the migration runner against a real PostgreSQL.
 *
 * Every file runs once and is recorded; a second run is a no-op, and a
 * database that already has TAIA tables but no history (not created by this
 * runner) is refused instead of being migrated on top.
 *
 * Requires: pnpm db:test:up (Postgres de test en localhost:5433)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkMigrationDrift, listExpectedMigrations } from '../../../src/db/migrations'
import {
  cleanupTestPool,
  dropAllTables,
  getTestPool,
  MIGRATIONS_DIR,
  runAllMigrations,
  testDBAvailable,
} from '../db/test-db-helper'

const MIGRATIONS = listExpectedMigrations(MIGRATIONS_DIR).map((m) => m.filename)

describe.skipIf(!testDBAvailable)('Migration runner (integration)', () => {
  beforeAll(async () => {
    await dropAllTables()
  })

  afterAll(async () => {
    await dropAllTables()
    await cleanupTestPool()
  })

  it('starts from the baseline', () => {
    expect(MIGRATIONS[0]).toBe('0001_baseline.sql')
  })

  it('applies every migration on a fresh database', async () => {
    const result = await runAllMigrations()
    expect(result.applied).toEqual(MIGRATIONS)
  })

  it('is a no-op the second time', async () => {
    const result = await runAllMigrations()
    expect(result).toEqual({ applied: [], alreadyApplied: MIGRATIONS.length })
    expect((await checkMigrationDrift(getTestPool(), MIGRATIONS_DIR)).status).toBe('ok')
  })

  it('seeds the default workspace and the board presets', async () => {
    const pool = getTestPool()
    const workspaces = await pool.query('SELECT id FROM workspaces')
    const presets = await pool.query('SELECT count(*)::int AS n FROM workspace_presets')
    expect(workspaces.rows.map((r) => r.id)).toEqual(['ws-default'])
    expect(presets.rows[0].n).toBe(5)
  })

  it('refuses a database with TAIA tables but no migration history', async () => {
    await getTestPool().query('DROP TABLE taia_schema_migrations')
    await expect(runAllMigrations()).rejects.toThrow(/no taia_schema_migrations table/)
  })
})
