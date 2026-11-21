// PostgreSQL connection pool singleton + shared helpers

import { Pool } from 'pg'
import { createHash } from 'crypto'
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

export const pool = new Pool(poolConfig)

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err)
})

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
