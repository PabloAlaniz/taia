import { execFileSync } from 'node:child_process'
import path from 'node:path'
import pg from 'pg'
import { E2E_DATABASE_URL } from '../playwright.config'

/** Start every run from an empty, freshly migrated database. */
export default async function globalSetup() {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(
      `e2e: cannot reach PostgreSQL at E2E_DATABASE_URL (${new URL(E2E_DATABASE_URL).host}). ` +
        'Start one with `pnpm db:test:up` or set E2E_DATABASE_URL to a throwaway database.',
      { cause: error },
    )
  }
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  } finally {
    await client.end()
  }

  const repoRoot = path.resolve(__dirname, '../../..')
  execFileSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', path.join(repoRoot, 'scripts/migrate.mts')],
    { cwd: repoRoot, env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL }, stdio: 'inherit' },
  )
}
