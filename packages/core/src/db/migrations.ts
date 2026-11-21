// Schema migrations: numbered `packages/core/migrations/NNNN_<name>.sql`
// files, starting with `0001_baseline.sql`. Each file runs once, in its own
// transaction, and is recorded with its checksum in taia_schema_migrations.
// An applied file must never change; a new schema change is always a new
// numbered file.
//
// This module has no relative imports so `scripts/migrate.mts` can load it
// with Node's own type stripping, outside any bundler.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const MIGRATION_HISTORY_TABLE = 'taia_schema_migrations'

/** Serialises concurrent runners (e.g. two containers booting at once). */
const MIGRATION_LOCK_ID = 7_310_301

export type MigrationDriftStatus = 'ok' | 'drift'

export interface ExpectedMigration {
  filename: string
  version: string
  sortKey: number
  checksum: string
}

export interface AppliedMigration {
  filename: string
  version: string
  checksum: string
  installedRank: number
}

export interface MigrationDriftReport {
  status: MigrationDriftStatus
  expectedCount: number
  appliedCount: number
  missing: string[]
  unexpected: string[]
  outOfOrder: string[]
  duplicateVersions: string[]
  /** Applied files whose content no longer matches what was applied. */
  changed: string[]
  historyTablePresent: boolean
  message: string
}

export interface Queryable {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

interface AppliedMigrationRow {
  version: string
  filename: string
  checksum: string
  installed_rank: number
}

const MIGRATIONS_SUBDIR = join('packages', 'core', 'migrations')
const BASELINE_FILENAME = '0001_baseline.sql'
const MIGRATION_FILE_RE = /^(\d{4})_[a-z0-9_-]+\.sql$/

/**
 * TAIA_MIGRATIONS_DIR, else the nearest `packages/core/migrations/` holding
 * the baseline from the working directory up (the web app runs from
 * apps/web, the CLI from the root). Resolved from the cwd rather than this
 * module because the Next bundle relocates it.
 */
export function defaultMigrationsDir(): string {
  if (process.env.TAIA_MIGRATIONS_DIR) return process.env.TAIA_MIGRATIONS_DIR
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, MIGRATIONS_SUBDIR)
    if (existsSync(join(candidate, BASELINE_FILENAME))) return candidate
    if (dirname(dir) === dir) return join(process.cwd(), MIGRATIONS_SUBDIR)
  }
}

/** SHA-256 of the file with line endings normalised, so checkouts agree. */
export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
}

export function listExpectedMigrations(migrationsDir: string): ExpectedMigration[] {
  const migrations = readdirSync(migrationsDir)
    .map((filename) => {
      const match = filename.match(MIGRATION_FILE_RE)
      if (!match) return null
      return { filename, version: match[1], sortKey: Number(match[1]) }
    })
    .filter((m): m is Omit<ExpectedMigration, 'checksum'> => m !== null)
    .sort((a, b) => a.sortKey - b.sortKey || a.filename.localeCompare(b.filename))
    .map((m) => ({
      ...m,
      checksum: migrationChecksum(readFileSync(join(migrationsDir, m.filename), 'utf8')),
    }))

  const duplicates = findDuplicateVersions(migrations.map((m) => m.version))
  if (duplicates.length > 0) {
    throw new Error(`Duplicate migration versions in ${migrationsDir}: ${duplicates.join(', ')}`)
  }
  return migrations
}

export async function inspectMigrationHistory(db: Queryable): Promise<{
  historyTablePresent: boolean
  applied: AppliedMigration[]
}> {
  const tableExists = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS exists`,
    [MIGRATION_HISTORY_TABLE],
  )

  if (!tableExists.rows[0]?.exists) {
    return { historyTablePresent: false, applied: [] }
  }

  const result = await db.query<AppliedMigrationRow>(
    `SELECT version, filename, checksum, installed_rank
     FROM ${MIGRATION_HISTORY_TABLE}
     ORDER BY installed_rank ASC`,
  )

  return {
    historyTablePresent: true,
    applied: result.rows.map((row) => ({
      version: row.version,
      filename: row.filename,
      checksum: row.checksum,
      installedRank: Number(row.installed_rank),
    })),
  }
}

export function compareMigrationHistory(
  expected: ExpectedMigration[],
  applied: AppliedMigration[],
  historyTablePresent = true,
): MigrationDriftReport {
  const expectedByVersion = new Map(expected.map((m) => [m.version, m]))
  const appliedByVersion = new Map(applied.map((m) => [m.version, m]))

  const missing = expected.filter((m) => !appliedByVersion.has(m.version)).map((m) => m.filename)

  const unexpected = applied
    .filter((m) => !expectedByVersion.has(m.version))
    .map((m) => m.filename || m.version)

  const outOfOrder = applied
    .filter((m, index) => {
      const expectedMigration = expected[index]
      return expectedMigration !== undefined && expectedMigration.version !== m.version
    })
    .map((m) => m.filename || m.version)

  const changed = applied
    .filter((m) => {
      const file = expectedByVersion.get(m.version)
      return file !== undefined && file.checksum !== m.checksum
    })
    .map((m) => m.filename)

  const duplicateVersions = findDuplicateVersions(applied.map((m) => m.version))

  const details = {
    historyTablePresent,
    missing,
    unexpected,
    outOfOrder,
    duplicateVersions,
    changed,
  }
  const status: MigrationDriftStatus =
    historyTablePresent &&
    [missing, unexpected, outOfOrder, duplicateVersions, changed].every((l) => l.length === 0)
      ? 'ok'
      : 'drift'

  return {
    status,
    expectedCount: expected.length,
    appliedCount: applied.length,
    ...details,
    message: buildMigrationDriftMessage(status, details),
  }
}

export async function checkMigrationDrift(
  db: Queryable,
  migrationsDir = defaultMigrationsDir(),
): Promise<MigrationDriftReport> {
  const expected = listExpectedMigrations(migrationsDir)
  const history = await inspectMigrationHistory(db)
  return compareMigrationHistory(expected, history.applied, history.historyTablePresent)
}

export class MigrationError extends Error {
  readonly filename?: string

  constructor(message: string, filename?: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MigrationError'
    this.filename = filename
  }
}

export interface ApplyMigrationsResult {
  applied: string[]
  alreadyApplied: number
}

/**
 * Apply every pending migration in order. `db` must be a single connection
 * (not a pool): the advisory lock and each transaction live on it.
 *
 * Refuses to run when history disagrees with the repository in a way
 * applying can't fix: an applied file that changed, a recorded version that
 * no longer exists, or a database that already has TAIA tables but no
 * migration history (created by something other than this runner).
 */
export async function applyPendingMigrations(
  db: Queryable,
  migrationsDir = defaultMigrationsDir(),
  log: (line: string) => void = () => {},
): Promise<ApplyMigrationsResult> {
  const expected = listExpectedMigrations(migrationsDir)

  await db.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
  try {
    const history = await inspectMigrationHistory(db)
    if (!history.historyTablePresent) {
      const existing = await db.query<{ tasks: string | null }>(
        `SELECT to_regclass('public.tasks')::text AS tasks`,
      )
      if (existing.rows[0]?.tasks) {
        throw new MigrationError(
          `The database already has TAIA tables but no ${MIGRATION_HISTORY_TABLE} table. ` +
            'It was not created by this migration runner (e.g. a pre-release install); ' +
            'start from an empty database.',
        )
      }
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_HISTORY_TABLE} (
        installed_rank SERIAL PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`)

    const { applied } = await inspectMigrationHistory(db)
    const report = compareMigrationHistory(expected, applied)
    if (report.changed.length > 0 || report.unexpected.length > 0) {
      throw new MigrationError(report.message)
    }

    const appliedVersions = new Set(applied.map((m) => m.version))
    const pending = expected.filter((m) => !appliedVersions.has(m.version))
    const done: string[] = []
    for (const migration of pending) {
      log(`Applying ${migration.filename}`)
      // Migrations are read from disk at run time, never bundled.
      const sql = readFileSync(
        /*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ migrationsDir, migration.filename),
        'utf8',
      )
      try {
        await db.query('BEGIN')
        await db.query(sql)
        await db.query(
          `INSERT INTO ${MIGRATION_HISTORY_TABLE} (version, filename, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.filename, migration.checksum],
        )
        await db.query('COMMIT')
      } catch (err) {
        await db.query('ROLLBACK').catch(() => undefined)
        const reason = err instanceof Error ? err.message : String(err)
        throw new MigrationError(`${migration.filename} failed: ${reason}`, migration.filename, {
          cause: err,
        })
      }
      done.push(migration.filename)
    }
    return { applied: done, alreadyApplied: expected.length - pending.length }
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined)
  }
}

function findDuplicateVersions(versions: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const version of versions) {
    if (seen.has(version)) duplicates.add(version)
    seen.add(version)
  }
  return Array.from(duplicates).sort()
}

function buildMigrationDriftMessage(
  status: MigrationDriftStatus,
  details: Pick<
    MigrationDriftReport,
    | 'historyTablePresent'
    | 'missing'
    | 'unexpected'
    | 'outOfOrder'
    | 'duplicateVersions'
    | 'changed'
  >,
): string {
  if (status === 'ok') return 'Migration history matches repository migrations.'

  const parts: string[] = []
  if (!details.historyTablePresent) {
    parts.push(`migration history table ${MIGRATION_HISTORY_TABLE} is missing`)
  }
  if (details.missing.length > 0) parts.push(`missing: ${details.missing.join(', ')}`)
  if (details.unexpected.length > 0) parts.push(`unexpected: ${details.unexpected.join(', ')}`)
  if (details.outOfOrder.length > 0) parts.push(`out of order: ${details.outOfOrder.join(', ')}`)
  if (details.duplicateVersions.length > 0) {
    parts.push(`duplicate applied versions: ${details.duplicateVersions.join(', ')}`)
  }
  if (details.changed.length > 0) {
    parts.push(`changed after being applied: ${details.changed.join(', ')}`)
  }

  return `Migration drift detected (${parts.join('; ')}). Run \`pnpm migrate\`; never edit an applied migration, add a new one instead.`
}
