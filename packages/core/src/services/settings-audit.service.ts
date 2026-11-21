import { pool } from '../db/pool'
import { isSensitiveSettingKey } from '../secret-box'

export { isSensitiveSettingKey }

export type SettingsAuditOperation = 'create' | 'update' | 'revoke'
export type SettingsAuditResult = 'success' | 'skipped' | 'failure'

export interface SettingsAuditEvent {
  id: string
  workspace_id: string
  setting_key: string
  resource_type: 'setting' | 'api_key'
  operation: SettingsAuditOperation
  actor: string
  origin: string
  result: SettingsAuditResult
  message: string | null
  created_at: string
}

export interface RecordSettingsAuditInput {
  workspaceId: string
  settingKey: string
  operation: SettingsAuditOperation
  actor?: string
  origin?: string
  result?: SettingsAuditResult
  message?: string | null
}

export interface ListSettingsAuditInput {
  workspaceId: string
  operation?: SettingsAuditOperation
  resourceType?: 'setting' | 'api_key'
  settingKey?: string
  limit?: number
  offset?: number
}

const DEFAULT_RETENTION_DAYS = 90
const MAX_PAGE_SIZE = 200

export function classifySettingResource(key: string): 'setting' | 'api_key' {
  return isSensitiveSettingKey(key) ? 'api_key' : 'setting'
}

export async function ensureSettingsAuditTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings_audit_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('setting', 'api_key')),
      operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'revoke')),
      actor TEXT NOT NULL DEFAULT 'unknown',
      origin TEXT NOT NULL DEFAULT 'unknown',
      result TEXT NOT NULL CHECK (result IN ('success', 'skipped', 'failure')),
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_settings_audit_workspace_created ON settings_audit_events(workspace_id, created_at DESC)',
  )
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_settings_audit_workspace_key ON settings_audit_events(workspace_id, setting_key, created_at DESC)',
  )
}

export async function recordSettingsAuditEvent(
  input: RecordSettingsAuditInput,
): Promise<SettingsAuditEvent> {
  await ensureSettingsAuditTable()
  const id = `settings-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const result = await pool.query(
    `
      INSERT INTO settings_audit_events (
        id, workspace_id, setting_key, resource_type, operation, actor, origin, result, message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
    [
      id,
      input.workspaceId,
      input.settingKey,
      classifySettingResource(input.settingKey),
      input.operation,
      input.actor || 'unknown',
      input.origin || 'unknown',
      input.result || 'success',
      input.message || null,
    ],
  )
  return result.rows[0]
}

export async function listSettingsAuditEvents(input: ListSettingsAuditInput): Promise<{
  events: SettingsAuditEvent[]
  total: number
  limit: number
  offset: number
}> {
  await ensureSettingsAuditTable()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), MAX_PAGE_SIZE)
  const offset = Math.max(input.offset ?? 0, 0)
  const conditions = ['workspace_id = $1']
  const values: unknown[] = [input.workspaceId]

  if (input.operation) {
    values.push(input.operation)
    conditions.push(`operation = $${values.length}`)
  }
  if (input.resourceType) {
    values.push(input.resourceType)
    conditions.push(`resource_type = $${values.length}`)
  }
  if (input.settingKey) {
    values.push(input.settingKey)
    conditions.push(`setting_key = $${values.length}`)
  }

  const where = conditions.join(' AND ')
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM settings_audit_events WHERE ${where}`,
    values,
  )
  const queryValues = [...values, limit, offset]
  const rowsResult = await pool.query(
    `
      SELECT * FROM settings_audit_events
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}
    `,
    queryValues,
  )

  return {
    events: rowsResult.rows,
    total: countResult.rows[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function cleanupSettingsAuditEvents(input: {
  workspaceId: string
  retentionDays?: number
}): Promise<{ deleted: number; cutoff: string }> {
  await ensureSettingsAuditTable()
  const retentionDays = Math.max(input.retentionDays ?? DEFAULT_RETENTION_DAYS, 1)
  const result = await pool.query(
    `
      DELETE FROM settings_audit_events
      WHERE workspace_id = $1
        AND created_at < NOW() - ($2::text || ' days')::interval
    `,
    [input.workspaceId, retentionDays],
  )
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  return { deleted: result.rowCount ?? 0, cutoff }
}
