// Outgoing webhooks waiting to be delivered (migration 0007). Each row is one
// message to one endpoint; omniwebhook_attempts (migration 0006) keeps every
// attempt made for it.

import { pool } from '../pool'

export type OutboxState = 'pending' | 'delivered' | 'failed'

export interface OutboxMessage {
  id: number
  workspaceId: string
  endpointId: string
  messageId: string
  event: string
  payload: string
  attempt: number
  state: OutboxState
  nextAt: Date
  lastResult: string | null
  lastStatus: number | null
  replays: number
  createdAt: Date
  updatedAt: Date
}

interface OutboxRow {
  id: string | number
  workspace_id: string
  endpoint_id: string
  message_id: string
  event: string
  payload: string
  attempt: number
  state: OutboxState
  next_at: Date
  last_result: string | null
  last_status: number | null
  replays: number
  created_at: Date
  updated_at: Date
}

const COLUMNS = `id, workspace_id, endpoint_id, message_id, event, payload, attempt, state,
  next_at, last_result, last_status, replays, created_at, updated_at`

const toMessage = (row: OutboxRow): OutboxMessage => ({
  id: Number(row.id),
  workspaceId: row.workspace_id,
  endpointId: row.endpoint_id,
  messageId: row.message_id,
  event: row.event,
  payload: row.payload,
  attempt: row.attempt,
  state: row.state,
  nextAt: row.next_at,
  lastResult: row.last_result,
  lastStatus: row.last_status,
  replays: row.replays,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export interface NewOutboxMessage {
  workspaceId: string
  endpointId: string
  messageId: string
  event: string
  payload: string
}

/** Queue messages for delivery, due now. One statement, so all or none. */
export async function enqueueOutboxMessages(messages: NewOutboxMessage[]): Promise<void> {
  if (messages.length === 0) return
  await pool.query(
    `INSERT INTO webhook_outbox (workspace_id, endpoint_id, message_id, event, payload)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])`,
    [
      messages.map((m) => m.workspaceId),
      messages.map((m) => m.endpointId),
      messages.map((m) => m.messageId),
      messages.map((m) => m.event),
      messages.map((m) => m.payload),
    ],
  )
}

/**
 * Take up to `limit` due messages for `lockSeconds`. Rows another dispatcher
 * holds are skipped, so several processes can dispatch from one table; a
 * dispatcher that dies mid-attempt leaves its rows to be taken again once the
 * lock runs out.
 */
export async function claimDueOutboxMessages(
  limit: number,
  lockSeconds: number,
): Promise<OutboxMessage[]> {
  const result = await pool.query<OutboxRow>(
    `UPDATE webhook_outbox SET locked_until = now() + make_interval(secs => $2)
     WHERE id IN (
       SELECT id FROM webhook_outbox
       WHERE state = 'pending' AND next_at <= now()
         AND (locked_until IS NULL OR locked_until <= now())
       ORDER BY next_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING ${COLUMNS}`,
    [limit, lockSeconds],
  )
  return result.rows.map(toMessage)
}

export interface OutboxOutcome {
  state: OutboxState
  /** omniwebhook's state for the attempt (pending, delivered, gone…) or why none was made. */
  result: string
  status: number | null
  /** Pending only: the next attempt's number and when it is due. */
  attempt?: number
  nextAt?: Date
}

/** Record how an attempt ended and release the row. */
export async function settleOutboxMessage(id: number, outcome: OutboxOutcome): Promise<void> {
  await pool.query(
    `UPDATE webhook_outbox
     SET state = $2, last_result = $3, last_status = $4,
         attempt = COALESCE($5, attempt), next_at = COALESCE($6, next_at),
         locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [
      id,
      outcome.state,
      outcome.result,
      outcome.status,
      outcome.attempt ?? null,
      outcome.nextAt ?? null,
    ],
  )
}

export async function findOutboxMessage(
  workspaceId: string,
  messageId: string,
): Promise<OutboxMessage | null> {
  const result = await pool.query<OutboxRow>(
    `SELECT ${COLUMNS} FROM webhook_outbox WHERE workspace_id = $1 AND message_id = $2`,
    [workspaceId, messageId],
  )
  return result.rows[0] ? toMessage(result.rows[0]) : null
}

/**
 * Send a message again from its first attempt, with the same message id so the
 * receiver can tell it is the same one. Only a failed message, and only while
 * it has replays left; answers whether it was queued.
 */
export async function requeueOutboxMessage(id: number, maxReplays: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE webhook_outbox
     SET state = 'pending', attempt = 1, next_at = now(), locked_until = NULL,
         replays = replays + 1, updated_at = now()
     WHERE id = $1 AND state = 'failed' AND replays < $2
     RETURNING id`,
    [id, maxReplays],
  )
  return result.rows.length > 0
}

/** The newest messages of a workspace. */
export async function listOutboxMessages(
  workspaceId: string,
  limit: number,
): Promise<OutboxMessage[]> {
  const result = await pool.query<OutboxRow>(
    `SELECT ${COLUMNS} FROM webhook_outbox WHERE workspace_id = $1
     ORDER BY created_at DESC, id DESC LIMIT $2`,
    [workspaceId, limit],
  )
  return result.rows.map(toMessage)
}

/** Delete delivered and failed messages last touched before `before`. */
export async function purgeSettledOutboxMessages(before: Date): Promise<number> {
  const result = await pool.query(
    `DELETE FROM webhook_outbox WHERE state <> 'pending' AND updated_at < $1`,
    [before],
  )
  return result.rowCount ?? 0
}

export interface OutboxAttempt {
  messageId: string
  attempt: number
  at: Date
  state: string
  status: number | null
  problem: string | null
  durationMs: number
}

/** The attempts omniwebhook recorded for these messages, oldest first. */
export async function listOutboxAttempts(messageIds: string[]): Promise<OutboxAttempt[]> {
  if (messageIds.length === 0) return []
  const result = await pool.query<{
    message_id: string
    attempt: number
    at: string
    state: string
    status: number | null
    problem: string | null
    duration_ms: string
  }>(
    `SELECT message_id, attempt, at, state, status, problem, duration_ms
     FROM omniwebhook_attempts WHERE message_id = ANY($1::text[]) ORDER BY id`,
    [messageIds],
  )
  return result.rows.map((row) => ({
    messageId: row.message_id,
    attempt: row.attempt,
    at: new Date(Number(row.at) * 1000),
    state: row.state,
    status: row.status,
    problem: row.problem,
    durationMs: Number(row.duration_ms),
  }))
}
