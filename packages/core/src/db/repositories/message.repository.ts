// Message repository — async only, N+1 fixed with JOIN

import type { Message } from '@taia/types'
import { pool, generateId, createIdempotencyKey } from '../pool'

// Fixed N+1: single query with LEFT JOIN instead of loop
export async function getMessagesForTask(taskId: string): Promise<Message[]> {
  const res = await pool.query(
    `
    SELECT
      m.id, m.task_id, m.from_agent_id, m.content, m.created_at,
      COALESCE(
        array_agg(mm.agent_id) FILTER (WHERE mm.agent_id IS NOT NULL),
        ARRAY[]::text[]
      ) as mentions
    FROM messages m
    LEFT JOIN message_mentions mm ON m.id = mm.message_id
    WHERE m.task_id = $1
    GROUP BY m.id, m.task_id, m.from_agent_id, m.content, m.created_at
    ORDER BY m.created_at ASC
  `,
    [taskId],
  )

  return res.rows
}

export async function createMessage(data: {
  task_id: string
  from_agent_id: string
  content: string
}): Promise<Message> {
  const id = generateId()

  // Extract @mentions
  const mentionRegex = /@(\w+)/g
  const mentions: string[] = []
  let match
  while ((match = mentionRegex.exec(data.content)) !== null) {
    mentions.push(match[1].toLowerCase())
  }

  // Get task title for activity log
  const taskRes = await pool.query('SELECT title FROM tasks WHERE id = $1', [data.task_id])
  const taskTitle = taskRes.rows[0]?.title || 'task'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `
      INSERT INTO messages (id, task_id, from_agent_id, content)
      VALUES ($1, $2, $3, $4)
    `,
      [id, data.task_id, data.from_agent_id, data.content],
    )

    for (const agentId of mentions) {
      await client.query('INSERT INTO message_mentions (message_id, agent_id) VALUES ($1, $2)', [
        id,
        agentId,
      ])
    }

    await client.query(
      `
      INSERT INTO activities (id, type, agent_id, task_id, message)
      VALUES ($1, 'message_sent', $2, $3, $4)
    `,
      [
        generateId(),
        data.from_agent_id,
        data.task_id,
        `${data.from_agent_id} commented on "${taskTitle}"`,
      ],
    )

    // Create notifications for mentioned agents
    for (const mentionedAgent of mentions) {
      if (mentionedAgent === data.from_agent_id) continue

      const idempotencyKey = createIdempotencyKey(data.task_id, mentionedAgent, data.content, id)
      const notifContent = `@${data.from_agent_id} mentioned you: "${data.content.slice(0, 100)}${data.content.length > 100 ? '...' : ''}"`

      try {
        await client.query(
          `
          INSERT INTO notifications (id, idempotency_key, mentioned_agent_id, from_agent_id, task_id, source_message_id, content)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            generateId(),
            idempotencyKey,
            mentionedAgent,
            data.from_agent_id,
            data.task_id,
            id,
            notifContent,
          ],
        )
      } catch (e) {
        if (!(e instanceof Error && e.message.includes('duplicate key'))) throw e
      }
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  const msgRes = await pool.query('SELECT * FROM messages WHERE id = $1', [id])
  const msg = msgRes.rows[0]
  msg.mentions = mentions
  return msg
}
