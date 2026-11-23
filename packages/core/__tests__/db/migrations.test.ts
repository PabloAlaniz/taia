import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterAll, describe, expect, it } from 'vitest'
import {
  applyPendingMigrations,
  compareMigrationHistory,
  inspectMigrationHistory,
  listExpectedMigrations,
  migrationChecksum,
  MIGRATION_HISTORY_TABLE,
  type Queryable,
} from '../../src/db/migrations'

const scriptsDirs: string[] = []
afterAll(() => {
  for (const dir of scriptsDirs) rmSync(dir, { recursive: true, force: true })
})

/** A fresh private directory (mkdtemp: unique name, mode 0700) holding these migrations. */
function makeScriptsDir(files: string[] | Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'taia-migrations-'))
  scriptsDirs.push(dir)
  const entries = Array.isArray(files)
    ? files.map((file) => [file, '-- test migration\n'])
    : Object.entries(files)
  for (const [file, sql] of entries) writeFileSync(join(dir, file), sql)
  return dir
}

const SUM = migrationChecksum('-- test migration\n')

describe('migration drift diagnostics', () => {
  it('discovers numbered migrations in numeric order and ignores other files', () => {
    const dir = makeScriptsDir([
      'README.md',
      'migrate-001-legacy.sql',
      '0010_workspaces.sql',
      '0003_created_by.sql',
      '0001_baseline.sql',
      '0002_projects.sql',
    ])

    expect(listExpectedMigrations(dir).map((migration) => migration.filename)).toEqual([
      '0001_baseline.sql',
      '0002_projects.sql',
      '0003_created_by.sql',
      '0010_workspaces.sql',
    ])
  })

  it('reports ok when applied history matches expected order', () => {
    const expected = [
      { filename: '0001_baseline.sql', version: '0001', sortKey: 1, checksum: SUM },
      { filename: '0002_projects.sql', version: '0002', sortKey: 2, checksum: SUM },
    ]

    const report = compareMigrationHistory(expected, [
      { filename: '0001_baseline.sql', version: '0001', installedRank: 1, checksum: SUM },
      { filename: '0002_projects.sql', version: '0002', installedRank: 2, checksum: SUM },
    ])

    expect(report.status).toBe('ok')
    expect(report.missing).toEqual([])
    expect(report.unexpected).toEqual([])
    expect(report.outOfOrder).toEqual([])
  })

  it('reports missing, unexpected and out-of-order migration drift', () => {
    const expected = [
      { filename: '0001_baseline.sql', version: '0001', sortKey: 1, checksum: SUM },
      { filename: '0002_projects.sql', version: '0002', sortKey: 2, checksum: SUM },
      { filename: '0003_created_by.sql', version: '0003', sortKey: 3, checksum: SUM },
    ]

    const report = compareMigrationHistory(expected, [
      { filename: '0002_projects.sql', version: '0002', installedRank: 1, checksum: SUM },
      { filename: '9999_local.sql', version: '9999', installedRank: 2, checksum: SUM },
    ])

    expect(report.status).toBe('drift')
    expect(report.missing).toEqual(['0001_baseline.sql', '0003_created_by.sql'])
    expect(report.unexpected).toEqual(['9999_local.sql'])
    expect(report.outOfOrder).toEqual(['0002_projects.sql', '9999_local.sql'])
    expect(report.message).toContain('Migration drift detected')
  })

  it('treats a missing migration history table as actionable drift', async () => {
    const queries: unknown[][] = []
    const db: Queryable = {
      async query<T = unknown>(sql: string, params?: unknown[]) {
        queries.push([sql, params])
        return { rows: [{ exists: false } as T] }
      },
    }

    const history = await inspectMigrationHistory(db)

    expect(history).toEqual({ historyTablePresent: false, applied: [] })
    expect(String(queries[0][0])).toContain('information_schema.tables')
    expect(queries[0][1]).toEqual([MIGRATION_HISTORY_TABLE])
  })

  it('ignores line endings in checksums', () => {
    expect(migrationChecksum('a\r\nb\r\n')).toBe(migrationChecksum('a\nb\n'))
  })

  it('reports an applied migration whose file changed', () => {
    const expected = [
      { filename: '0001_baseline.sql', version: '0001', sortKey: 1, checksum: 'new' },
    ]

    const report = compareMigrationHistory(expected, [
      { filename: '0001_baseline.sql', version: '0001', installedRank: 1, checksum: 'old' },
    ])

    expect(report.status).toBe('drift')
    expect(report.changed).toEqual(['0001_baseline.sql'])
  })
})

/** In-memory stand-in for one Postgres connection and its history table. */
function fakeDb(history: Array<{ version: string; filename: string; checksum: string }> = []) {
  const executed: string[] = []
  let pending: typeof history = []
  const db: Queryable & { executed: string[]; history: typeof history } = {
    executed,
    history,
    async query<T = unknown>(sql: string, params?: unknown[]) {
      const text = sql.trim()
      executed.push(text)
      if (text.includes('information_schema.tables')) return { rows: [{ exists: true } as T] }
      if (text.startsWith('SELECT version')) {
        return {
          rows: history.map((h, i) => ({ ...h, installed_rank: i + 1 }) as T),
        }
      }
      if (text.startsWith('INSERT INTO')) {
        const [version, filename, checksum] = params as string[]
        pending.push({ version, filename, checksum })
      }
      if (text === 'COMMIT') {
        history.push(...pending)
        pending = []
      }
      if (text === 'ROLLBACK') pending = []
      if (text.includes('boom')) throw new Error('syntax error at "boom"')
      return { rows: [] }
    },
  }
  return db
}

describe('applyPendingMigrations', () => {
  it('applies only pending migrations, each in its own transaction', async () => {
    const dir = makeScriptsDir({
      '0001_baseline.sql': 'CREATE TABLE a (id int);',
      '0002_b.sql': 'CREATE TABLE b (id int);',
    })
    const db = fakeDb([
      {
        version: '0001',
        filename: '0001_baseline.sql',
        checksum: migrationChecksum('CREATE TABLE a (id int);'),
      },
    ])

    const result = await applyPendingMigrations(db, dir)

    expect(result).toEqual({ applied: ['0002_b.sql'], alreadyApplied: 1 })
    expect(db.history.map((h) => h.version)).toEqual(['0001', '0002'])
    const tx = db.executed.slice(db.executed.indexOf('BEGIN'))
    expect(tx.slice(0, 2)).toEqual(['BEGIN', 'CREATE TABLE b (id int);'])
    expect(tx).toContain('COMMIT')
    expect(db.executed.at(-1)).toContain('pg_advisory_unlock')
  })

  it('rolls back and stops at the first failing migration', async () => {
    const dir = makeScriptsDir({
      '0001_baseline.sql': 'boom',
      '0002_b.sql': 'CREATE TABLE b (id int);',
    })
    const db = fakeDb()

    await expect(applyPendingMigrations(db, dir)).rejects.toThrow('0001_baseline.sql failed')

    expect(db.executed).toContain('ROLLBACK')
    expect(db.executed).not.toContain('CREATE TABLE b (id int);')
    expect(db.history).toEqual([])
  })

  it('refuses a database that has TAIA tables but no history', async () => {
    const dir = makeScriptsDir({ '0001_baseline.sql': 'CREATE TABLE a (id int);' })
    const executed: string[] = []
    const db: Queryable = {
      async query<T = unknown>(sql: string) {
        executed.push(sql.trim())
        if (sql.includes('information_schema.tables')) return { rows: [{ exists: false } as T] }
        if (sql.includes('to_regclass')) return { rows: [{ tasks: 'tasks' } as T] }
        return { rows: [] }
      },
    }

    await expect(applyPendingMigrations(db, dir)).rejects.toThrow(/no taia_schema_migrations table/)
    expect(executed).not.toContain('BEGIN')
  })

  it('refuses to run when an applied migration was edited', async () => {
    const dir = makeScriptsDir({ '0001_baseline.sql': 'CREATE TABLE a (id int, x int);' })
    const db = fakeDb([{ version: '0001', filename: '0001_baseline.sql', checksum: 'stale' }])

    await expect(applyPendingMigrations(db, dir)).rejects.toThrow('changed after being applied')
    expect(db.executed).not.toContain('BEGIN')
  })
})
