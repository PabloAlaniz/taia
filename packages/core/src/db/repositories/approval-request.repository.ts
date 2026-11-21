// Approval requests repository — skeleton for the Approvals capability.
//
// Persistence + CRUD. The adapter's polling loop that blocks tool execution
// until the status flips lives in the adapter executor.

import { pool, generateId } from '../pool'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timed_out'

export interface ApprovalRequestRow {
  id: string
  session_key: string
  agent_id: string
  tool_name: string
  tool_use_id: string
  tool_input: Record<string, unknown> | null
  status: ApprovalStatus
  decision_reason: string | null
  decided_at: string | null
  decided_by: string | null
  created_at: string
  updated_at: string
}

/** Create a pending approval request for a tool call. */
export async function createApprovalRequest(input: {
  session_key: string
  agent_id: string
  tool_name: string
  tool_use_id: string
  tool_input?: Record<string, unknown>
}): Promise<ApprovalRequestRow> {
  const id = generateId()
  const res = await pool.query<ApprovalRequestRow>(
    `INSERT INTO approval_requests
       (id, session_key, agent_id, tool_name, tool_use_id, tool_input)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      id,
      input.session_key,
      input.agent_id,
      input.tool_name,
      input.tool_use_id,
      input.tool_input ? JSON.stringify(input.tool_input) : null,
    ],
  )
  return res.rows[0]
}

export async function getApprovalRequest(id: string): Promise<ApprovalRequestRow | null> {
  const res = await pool.query<ApprovalRequestRow>(
    `SELECT * FROM approval_requests WHERE id = $1`,
    [id],
  )
  return res.rows[0] ?? null
}

export async function getPendingApprovalForToolUse(
  sessionKey: string,
  toolUseId: string,
): Promise<ApprovalRequestRow | null> {
  const res = await pool.query<ApprovalRequestRow>(
    `SELECT * FROM approval_requests
     WHERE session_key = $1 AND tool_use_id = $2`,
    [sessionKey, toolUseId],
  )
  return res.rows[0] ?? null
}

export async function listApprovalRequests(options?: {
  agentId?: string
  sessionKey?: string
  status?: ApprovalStatus
  limit?: number
}): Promise<ApprovalRequestRow[]> {
  const filters: string[] = []
  const values: unknown[] = []
  if (options?.agentId) {
    values.push(options.agentId)
    filters.push(`agent_id = $${values.length}`)
  }
  if (options?.sessionKey) {
    values.push(options.sessionKey)
    filters.push(`session_key = $${values.length}`)
  }
  if (options?.status) {
    values.push(options.status)
    filters.push(`status = $${values.length}`)
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''
  const limit = options?.limit ?? 100

  const res = await pool.query<ApprovalRequestRow>(
    `SELECT * FROM approval_requests ${whereClause}
     ORDER BY created_at DESC LIMIT ${limit}`,
    values,
  )
  return res.rows
}

export async function decideApproval(
  id: string,
  decision: { status: 'approved' | 'rejected'; reason?: string; decidedBy?: string },
): Promise<ApprovalRequestRow | null> {
  const res = await pool.query<ApprovalRequestRow>(
    `UPDATE approval_requests
       SET status = $2,
           decision_reason = $3,
           decided_by = $4,
           decided_at = NOW(),
           updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, decision.status, decision.reason || null, decision.decidedBy || null],
  )
  return res.rows[0] ?? null
}
