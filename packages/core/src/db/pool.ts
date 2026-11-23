// PostgreSQL connection pool singleton + shared helpers

import pg, { Pool } from 'pg'
import { createHash, randomBytes } from 'crypto'
import { config } from '../config'

import type { AgentRecord, Subtask } from '@taia/types'

const poolConfig = config.db.connectionString
  ? { connectionString: config.db.connectionString, max: config.db.maxConnections }
  : {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      max: config.db.maxConnections,
    }

// Timestamps are stored as UTC wall-clock in `timestamp without time zone`
// columns (DEFAULT now() runs in the UTC session). node-pg would read them,
// and serialise Date parameters, in the server's local zone, so any machine
// not set to UTC saw times shifted by its offset ("created in 5 hours").
// Read and write them as UTC.
const TIMESTAMP_WITHOUT_TZ = 1114
pg.types.setTypeParser(TIMESTAMP_WITHOUT_TZ, (value) => new Date(`${value.replace(' ', 'T')}Z`))
pg.defaults.parseInputDatesAsUTC = true

export const pool = new Pool(poolConfig)

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err)
})

/** A row id: creation time in ms, then 64 random bits from the OS generator. */
export function generateId(): string {
  return `${Date.now()}-${randomBytes(8).toString('hex')}`
}

export function createIdempotencyKey(
  taskId: string,
  agentId: string,
  content: string,
  sourceMessageId?: string,
): string {
  const data = `${taskId}|${agentId}|${content}|${sourceMessageId || ''}`
  return createHash('sha256').update(data).digest('hex').slice(0, 32)
}

export function normalizeAgent(row: Record<string, unknown>): AgentRecord {
  return {
    ...(row as object),
    enabled: row.enabled === true || row.enabled === 1 ? 1 : 0,
    config: typeof row.config === 'object' ? JSON.stringify(row.config) : row.config,
  } as AgentRecord
}

export function normalizeSubtask(row: Record<string, unknown>): Subtask {
  return {
    ...(row as object),
    completed: Boolean(row.completed),
  } as Subtask
}
