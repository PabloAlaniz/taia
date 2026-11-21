#!/usr/bin/env node
// Schema migration CLI. `node scripts/migrate.mts` applies pending migrations;
// `--check` only reports drift (exit 1 on drift); `--json` prints the report.
// Connects through DATABASE_URL, or the POSTGRES_* variables.

import pg from 'pg'

import {
  applyPendingMigrations,
  checkMigrationDrift,
  defaultMigrationsDir,
} from '../packages/core/src/db/migrations.ts'

function clientConfig(): pg.ClientConfig {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'taia',
    password: process.env.POSTGRES_PASSWORD || 'taia',
    database: process.env.POSTGRES_DB || 'taia',
  }
}

const migrationsDir = defaultMigrationsDir()
const checkOnly = process.argv.includes('--check')
const json = process.argv.includes('--json')
const client = new pg.Client(clientConfig())

try {
  await client.connect()
  if (checkOnly) {
    const report = await checkMigrationDrift(client, migrationsDir)
    if (json) console.log(JSON.stringify(report, null, 2))
    else if (report.status === 'ok') console.log(`OK: ${report.message} (${report.appliedCount})`)
    else console.error(`DRIFT: ${report.message}`)
    process.exitCode = report.status === 'ok' ? 0 : 1
  } else {
    const result = await applyPendingMigrations(client, migrationsDir, (line) =>
      console.log(`[migrate] ${line}`),
    )
    console.log(
      `[migrate] ${result.applied.length} applied, ${result.alreadyApplied} already up to date`,
    )
  }
} catch (error) {
  console.error(`[migrate] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
