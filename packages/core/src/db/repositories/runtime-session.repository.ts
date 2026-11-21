// Runtime sessions repository — generic, provider-agnostic conversation
// storage for runtime adapters that don't have server-side sessions
// (Anthropic Messages API today; Cursor/Aider/etc. in the future).
//
// OpenClawAdapter does NOT use this — its sessions live in the OpenClaw
// gateway. `instance_id` names the runtime instance that owns the session
//; `provider` records which adapter kind wrote it.

import { pool, generateId } from '../pool'

// --- Row shapes ---

export interface RuntimeSessionRow {
  session_key: string
  agent_id: string
  provider: string
  /** Runtime instance that owns the session; NULL for rows of a deleted instance. */
  instance_id: string | null
  run_id: string
  model: string | null
  status: 'running' | 'idle' | 'failed'
  stop_reason: string | null
  label: string | null
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  /** Wall-clock duration of the session in milliseconds; NULL while running. */
  duration_ms: number | null
  metadata: Record<string, unknown> | null
  /**
   * Audit trail per run — which version of each bundle layer was active when
   * this session spawned. Shape:
   *   { agent_identity: 'v_xxx',
   *     project_context: 'v_yyy',
   *     user_profile:    'v_zzz' }
   * NULL on legacy rows or spawns that didn't carry a bundle. Used to
   * correlate "this run misbehaved" with "which version of the agent's
   * identity it used" — see ADR-003 §Versioning.
   */
  bundle_version_ids: Record<string, string> | null
  created_at: string
  updated_at: string
}

export interface RuntimeMessageRow {
  id: string
  session_key: string
  role: 'user' | 'assistant' | 'tool'
  content: unknown
  model: string | null
  stop_reason: string | null
  position: number
  created_at: string
}

// --- Sessions ---

export async function createRuntimeSession(input: {
  session_key: string
  agent_id: string
  provider: string
  instance_id: string
  run_id: string
  model?: string
  label?: string
  metadata?: Record<string, unknown>
  bundle_version_ids?: Record<string, string>
}): Promise<RuntimeSessionRow> {
  const res = await pool.query<RuntimeSessionRow>(
    `INSERT INTO runtime_sessions (session_key, agent_id, provider, instance_id, run_id, model, label, metadata, bundle_version_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.session_key,
      input.agent_id,
      input.provider,
      input.instance_id,
      input.run_id,
      input.model || null,
      input.label || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.bundle_version_ids ? JSON.stringify(input.bundle_version_ids) : null,
    ],
  )
  return res.rows[0]
}

export async function getRuntimeSession(sessionKey: string): Promise<RuntimeSessionRow | null> {
  const res = await pool.query<RuntimeSessionRow>(
    `SELECT * FROM runtime_sessions WHERE session_key = $1`,
    [sessionKey],
  )
  return res.rows[0] ?? null
}

export interface UpdateRuntimeSessionInput {
  status?: 'running' | 'idle' | 'failed'
  stop_reason?: string | null
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  duration_ms?: number
  metadata?: Record<string, unknown>
}

export async function updateRuntimeSession(
  sessionKey: string,
  updates: UpdateRuntimeSessionInput,
): Promise<RuntimeSessionRow | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue
    fields.push(`${key} = $${idx}`)
    values.push(key === 'metadata' && value !== null ? JSON.stringify(value) : value)
    idx++
  }

  if (fields.length === 0) return getRuntimeSession(sessionKey)

  fields.push(`updated_at = NOW()`)
  values.push(sessionKey)

  const res = await pool.query<RuntimeSessionRow>(
    `UPDATE runtime_sessions SET ${fields.join(', ')} WHERE session_key = $${idx} RETURNING *`,
    values,
  )
  return res.rows[0] ?? null
}

export interface ListRuntimeSessionsOptions {
  instanceId?: string
  agentId?: string
  limit?: number
  activeMinutes?: number
}

export async function listRuntimeSessions(
  options?: ListRuntimeSessionsOptions,
): Promise<RuntimeSessionRow[]> {
  const filters: string[] = []
  const values: unknown[] = []

  if (options?.instanceId) {
    values.push(options.instanceId)
    filters.push(`instance_id = $${values.length}`)
  }
  if (options?.agentId) {
    values.push(options.agentId)
    filters.push(`agent_id = $${values.length}`)
  }
  if (options?.activeMinutes) {
    filters.push(`updated_at >= NOW() - INTERVAL '${options.activeMinutes} minutes'`)
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''
  const limit = options?.limit ?? 100

  const res = await pool.query<RuntimeSessionRow>(
    `SELECT * FROM runtime_sessions ${whereClause}
     ORDER BY updated_at DESC LIMIT ${limit}`,
    values,
  )
  return res.rows
}

// --- Messages ---

export async function appendRuntimeMessage(input: {
  session_key: string
  role: 'user' | 'assistant' | 'tool'
  content: unknown
  model?: string
  stop_reason?: string
}): Promise<RuntimeMessageRow> {
  // Get next position for this session.
  const posRes = await pool.query<{ next: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next
       FROM runtime_messages WHERE session_key = $1`,
    [input.session_key],
  )
  const position = Number(posRes.rows[0]?.next ?? 0)

  const id = generateId()
  const res = await pool.query<RuntimeMessageRow>(
    `INSERT INTO runtime_messages (id, session_key, role, content, model, stop_reason, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id,
      input.session_key,
      input.role,
      JSON.stringify(input.content),
      input.model || null,
      input.stop_reason || null,
      position,
    ],
  )
  return res.rows[0]
}

export async function getRuntimeMessages(
  sessionKey: string,
  options?: { limit?: number },
): Promise<RuntimeMessageRow[]> {
  const limit = options?.limit ?? 1000
  const res = await pool.query<RuntimeMessageRow>(
    `SELECT * FROM runtime_messages WHERE session_key = $1
     ORDER BY position ASC LIMIT $2`,
    [sessionKey, limit],
  )
  return res.rows
}

export async function deleteRuntimeSession(sessionKey: string): Promise<void> {
  await pool.query(`DELETE FROM runtime_sessions WHERE session_key = $1`, [sessionKey])
}
