import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockClientQuery = vi.fn()
const mockRelease = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: vi.fn(() => ({
      query: mockClientQuery,
      release: mockRelease,
    })),
  },
  generateId: vi.fn(() => 'test-id-123'),
  createIdempotencyKey: vi.fn(() => 'idem-key-abc'),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { getMessagesForTask, createMessage } from '@taia/core/db/repositories/message.repository'

describe('message.repository', () => {
  // ---------------------------------------------------------------
  // getMessagesForTask
  // ---------------------------------------------------------------
  describe('getMessagesForTask', () => {
    it('returns messages with mentions using LEFT JOIN', async () => {
      const rows = [
        {
          id: 'msg-1',
          task_id: 'task-1',
          from_agent_id: 'agent-a',
          content: 'Hello',
          mentions: [],
        },
        {
          id: 'msg-2',
          task_id: 'task-1',
          from_agent_id: 'agent-b',
          content: 'Hi @agent-a',
          mentions: ['agent-a'],
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows })

      const result = await getMessagesForTask('task-1')

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('FROM messages m')
      expect(sql).toContain('LEFT JOIN message_mentions mm')
      expect(sql).toContain('WHERE m.task_id = $1')
      expect(sql).toContain('ORDER BY m.created_at ASC')
      expect(mockQuery.mock.calls[0][1]).toEqual(['task-1'])
      expect(result).toEqual(rows)
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no messages exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getMessagesForTask('task-empty')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // createMessage
  // ---------------------------------------------------------------
  describe('createMessage', () => {
    it('creates message without mentions in transaction', async () => {
      // Get task title
      mockQuery.mockResolvedValueOnce({ rows: [{ title: 'My Task' }] })
      // Transaction client queries
      mockClientQuery.mockResolvedValue({ rows: [] })
      // Final SELECT to return the message
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id-123',
            task_id: 'task-1',
            from_agent_id: 'agent-a',
            content: 'Hello world',
          },
        ],
      })

      const result = await createMessage({
        task_id: 'task-1',
        from_agent_id: 'agent-a',
        content: 'Hello world',
      })

      // Task title lookup
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT title FROM tasks')

      // Transaction: BEGIN, INSERT message, INSERT activity, COMMIT
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')
      const insertSql: string = mockClientQuery.mock.calls[1][0]
      expect(insertSql).toContain('INSERT INTO messages')
      expect(mockClientQuery.mock.calls[1][1]).toEqual([
        'test-id-123',
        'task-1',
        'agent-a',
        'Hello world',
      ])

      // Activity log
      const activitySql: string = mockClientQuery.mock.calls[2][0]
      expect(activitySql).toContain('INSERT INTO activities')
      expect(activitySql).toContain("'message_sent'")

      expect(mockRelease).toHaveBeenCalledOnce()
      expect(result.id).toBe('test-id-123')
      expect(result.mentions).toEqual([])
    })

    it('extracts mentions and creates notifications', async () => {
      // Get task title
      mockQuery.mockResolvedValueOnce({ rows: [{ title: 'Task' }] })
      // All client queries succeed
      mockClientQuery.mockResolvedValue({ rows: [] })
      // Final SELECT
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id-123',
            task_id: 'task-1',
            from_agent_id: 'agent-a',
            content: 'Hey @bob and @charlie',
          },
        ],
      })

      const result = await createMessage({
        task_id: 'task-1',
        from_agent_id: 'agent-a',
        content: 'Hey @bob and @charlie',
      })

      // Should have mentions for bob and charlie
      expect(result.mentions).toEqual(['bob', 'charlie'])

      // Transaction: BEGIN, INSERT message, INSERT mention (bob), INSERT mention (charlie),
      //   INSERT activity, INSERT notification (bob), INSERT notification (charlie), COMMIT
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN')

      // Check mention inserts
      const mentionCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO message_mentions'),
      )
      expect(mentionCalls).toHaveLength(2)
      expect(mentionCalls[0][1]).toEqual(['test-id-123', 'bob'])
      expect(mentionCalls[1][1]).toEqual(['test-id-123', 'charlie'])

      // Check notification inserts
      const notifCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications'),
      )
      expect(notifCalls).toHaveLength(2)
    })

    it('does not create notification for self-mention', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ title: 'Task' }] })
      mockClientQuery.mockResolvedValue({ rows: [] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id-123',
            task_id: 'task-1',
            from_agent_id: 'alice',
            content: 'Note to @alice',
          },
        ],
      })

      await createMessage({
        task_id: 'task-1',
        from_agent_id: 'alice',
        content: 'Note to @alice',
      })

      // No notification inserts for self-mention
      const notifCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications'),
      )
      expect(notifCalls).toHaveLength(0)
    })

    it('rolls back on error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ title: 'Task' }] })
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'))

      await expect(
        createMessage({ task_id: 'task-1', from_agent_id: 'agent-a', content: 'fail' }),
      ).rejects.toThrow('DB error')

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })
})
