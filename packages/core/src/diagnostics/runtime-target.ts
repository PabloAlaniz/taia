import { createHash } from 'node:crypto'
import { config } from '../config'
import { pool } from '../db'

export interface RuntimeTargetDiagnostic {
  service: string
  generated_at: string
  workspace_id: string
  db: {
    reachable: boolean
    target_hash: string
    target_source: 'DATABASE_URL' | 'POSTGRES_*'
    database: string | null
    user: string | null
    host: string | null
    port: number | null
    server_addr: string | null
    server_port: number | null
    db_oid: number | null
    postgres_version_num: number | null
  }
  workspace: {
    exists: boolean
    task_count: number
    active_task_count: number
  }
}

function redactConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    if (url.password) url.password = '<redacted>'
    if (url.username) url.username = '<redacted>'
    return url.toString()
  } catch {
    return connectionString.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1<redacted>$3')
  }
}

function getDbTarget() {
  if (config.db.connectionString) {
    const redacted = redactConnectionString(config.db.connectionString)
    return {
      source: 'DATABASE_URL' as const,
      printable: redacted,
      hashInput: redacted,
      host: null,
      port: null,
      database: null,
      user: null,
    }
  }

  const printable = `${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`
  return {
    source: 'POSTGRES_*' as const,
    printable,
    hashInput: printable,
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
  }
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export async function getRuntimeTargetDiagnostic(
  service: string,
  workspaceId = 'ws-default',
): Promise<RuntimeTargetDiagnostic> {
  const target = getDbTarget()
  const [{ rows: identityRows }, { rows: workspaceRows }, { rows: countRows }] = await Promise.all([
    pool.query(`
      SELECT
        current_database() AS database,
        current_user AS "user",
        inet_server_addr()::text AS server_addr,
        inet_server_port() AS server_port,
        (SELECT oid::int FROM pg_database WHERE datname = current_database()) AS db_oid,
        current_setting('server_version_num')::int AS postgres_version_num
    `),
    pool.query('SELECT id FROM workspaces WHERE id = $1 LIMIT 1', [workspaceId]),
    pool.query(
      `
        SELECT
          COUNT(*)::int AS task_count,
          COUNT(*) FILTER (WHERE status NOT IN ('DONE', 'REJECTED'))::int AS active_task_count
        FROM tasks
        WHERE workspace_id = $1
      `,
      [workspaceId],
    ),
  ])

  const identity = identityRows[0] ?? {}
  const counts = countRows[0] ?? {}

  // Authentication is optional (TAIA_API_TOKEN), so by default the DB
  // identity is reported as stable hashes: app and MCP can still be compared,
  // but anonymous callers don't learn the user, host or database name. TAIA_EXPOSE_DB_IDENTITY=1 shows
  // the raw values for local debugging.
  const expose = process.env.TAIA_EXPOSE_DB_IDENTITY === '1'
  const shown = (value: string | null | undefined): string | null =>
    value == null ? null : expose ? value : `hash:${stableHash(value)}`

  return {
    service,
    generated_at: new Date().toISOString(),
    workspace_id: workspaceId,
    db: {
      reachable: true,
      target_hash: stableHash(target.hashInput),
      target_source: target.source,
      database: shown(identity.database ?? target.database),
      user: shown(identity.user ?? target.user),
      host: shown(target.host),
      port: target.port,
      server_addr: shown(identity.server_addr),
      server_port: identity.server_port ?? null,
      db_oid: identity.db_oid ?? null,
      postgres_version_num: identity.postgres_version_num ?? null,
    },
    workspace: {
      exists: workspaceRows.length > 0,
      task_count: counts.task_count ?? 0,
      active_task_count: counts.active_task_count ?? 0,
    },
  }
}
