// Notification repository — async only

import type { Notification } from '@taia/types'
import { pool, generateId, createIdempotencyKey } from '../pool'

export async function getUndeliveredNotifications(): Promise<Notification[]> {
  const res = await pool.query(`
    SELECT *
    FROM notifications
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at
    LIMIT 20
  `)
  return res.rows
}

export async function getNotificationsForAgent(agentId: string): Promise<Notification[]> {
  const res = await pool.query(
    `
    SELECT * FROM notifications WHERE mentioned_agent_id = $1 ORDER BY created_at DESC
  `,
    [agentId],
  )
  return res.rows
}

export async function markNotificationDelivered(id: string): Promise<boolean> {
  const res = await pool.query(
    `
    UPDATE notifications
    SET status = 'delivered', last_attempt_at = NOW()
    WHERE id = $1
  `,
    [id],
  )
  return (res.rowCount ?? 0) > 0
}

export async function markNotificationFailed(id: string, attempts: number): Promise<boolean> {
  const res = await pool.query(
    `
    UPDATE notifications
    SET status = 'failed', attempts = $1, last_attempt_at = NOW()
    WHERE id = $2
  `,
    [attempts, id],
  )
  return (res.rowCount ?? 0) > 0
}

export async function incrementNotificationAttempt(
  id: string,
  attempts: number,
  nextRetryAt: string,
): Promise<boolean> {
  const res = await pool.query(
    `
    UPDATE notifications
    SET attempts = $1, last_attempt_at = NOW(), next_retry_at = $2
    WHERE id = $3
  `,
    [attempts, nextRetryAt, id],
  )
  return (res.rowCount ?? 0) > 0
}

export async function createNotification(data: {
  mentioned_agent_id: string
  from_agent_id?: string
  task_id?: string
  content: string
}): Promise<Notification | null> {
  const id = generateId()
  const idempotencyKey = createIdempotencyKey(
    data.task_id || '',
    data.mentioned_agent_id,
    data.content,
    '',
  )

  try {
    await pool.query(
      `
      INSERT INTO notifications (id, idempotency_key, mentioned_agent_id, from_agent_id, task_id, content)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [
        id,
        idempotencyKey,
        data.mentioned_agent_id,
        data.from_agent_id || null,
        data.task_id || null,
        data.content,
      ],
    )

    const res = await pool.query('SELECT * FROM notifications WHERE id = $1', [id])
    return res.rows[0]
  } catch (e) {
    if (e instanceof Error && e.message.includes('duplicate key')) return null
    throw e
  }
}
