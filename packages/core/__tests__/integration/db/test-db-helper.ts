/**
 * Test DB helper — sets up and tears down a clean database for integration tests.
 * Runs all migrations in order against the test database.
 *
 * Requires: PostgreSQL running on localhost:5433 (`pnpm db:test:up`)
 * Or: set TEST_DATABASE_URL to point to your test database.
 */

import { Pool } from 'pg'
import { join } from 'path'

import { applyPendingMigrations, type ApplyMigrationsResult } from '../../../src/db/migrations'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://taia_test:test@localhost:5433/taia_test'

let testPool: Pool | null = null

export function getTestPool(): Pool {
  if (!testPool) {
    testPool = new Pool({ connectionString: TEST_DATABASE_URL })
  }
  return testPool
}

export async function isTestDBAvailable(): Promise<boolean> {
  try {
    const pool = getTestPool()
    const result = await pool.query('SELECT 1')
    return result.rows.length > 0
  } catch {
    return false
  }
}

/**
 * Resolved when the module loads, so `describe.skipIf(!testDBAvailable)`
 * sees the real value (a flag set in `beforeAll` is still false when
 * vitest collects the suites). With REQUIRE_TEST_DB=1 (CI) a missing
 * database fails the run instead of skipping it.
 */
export const testDBAvailable = await isTestDBAvailable()
if (!testDBAvailable && process.env.REQUIRE_TEST_DB === '1') {
  throw new Error(`REQUIRE_TEST_DB=1 but the test database is unreachable: ${TEST_DATABASE_URL}`)
}

export const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations')

/** Apply every pending migration with the production runner. */
export async function runAllMigrations(pool?: Pool): Promise<ApplyMigrationsResult> {
  const client = await (pool || getTestPool()).connect()
  try {
    return await applyPendingMigrations(client, MIGRATIONS_DIR)
  } finally {
    client.release()
  }
}

/** Reset the database to an empty public schema (tables, functions, history). */
export async function dropAllTables(pool?: Pool): Promise<void> {
  const p = pool || getTestPool()
  await p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
}

export async function cleanupTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end()
    testPool = null
  }
}
