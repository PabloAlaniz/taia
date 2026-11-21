import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: vi.fn(() => 'test-id-123'),
  createIdempotencyKey: vi.fn(() => 'idem-key-abc'),
}))

beforeEach(() => vi.clearAllMocks())

import {
  getUndeliveredNotifications,
  getNotificationsForAgent,
  markNotificationDelivered,
  markNotificationFailed,
  incrementNotificationAttempt,
  createNotification,
} from '@taia/core/db/repositories/notification.repository'

describe('notification.repository', () => {
  const notifRow = {
    id: 'notif-1',
    idempotency_key: 'idem-key-abc',
    mentioned_agent_id: 'agent-a',
    from_agent_id: 'agent-b',
    task_id: 'task-1',
    content: 'Hey @agent-a, please review',
    status: 'pending',
    attempts: 0,
    last_attempt_at: null,
    next_retry_at: null,
    created_at: '2025-01-15T00:00:00Z',
  }

  // ---------------------------------------------------------------
  // getUndeliveredNotifications
  // ---------------------------------------------------------------
  describe('getUndeliveredNotifications', () => {
    it('returns pending notifications ready for delivery', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [notifRow] })

      const result = await getUndeliveredNotifications()

      expect(mockQuery).toHaveBeenCalledOnce()
      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("status = 'pending'")
      expect(sql).toContain('next_retry_at IS NULL OR next_retry_at <= NOW()')
      expect(sql).toContain('LIMIT 20')

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(notifRow)
    })

    it('returns empty array when no pending notifications', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getUndeliveredNotifications()

      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getNotificationsForAgent
  // ---------------------------------------------------------------
  describe('getNotificationsForAgent', () => {
    it('returns notifications for a specific agent ordered by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [notifRow] })

      const result = await getNotificationsForAgent('agent-a')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE mentioned_agent_id = $1'),
        ['agent-a'],
      )
      expect(result).toHaveLength(1)
    })

    it('returns empty array when agent has no notifications', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getNotificationsForAgent('agent-x')

      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // markNotificationDelivered
  // ---------------------------------------------------------------
  describe('markNotificationDelivered', () => {
    it('marks notification as delivered and returns true', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await markNotificationDelivered('notif-1')

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("status = 'delivered'")
      expect(sql).toContain('last_attempt_at = NOW()')
      expect(mockQuery.mock.calls[0][1]).toEqual(['notif-1'])
      expect(result).toBe(true)
    })

    it('returns false when notification not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await markNotificationDelivered('nonexistent')

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // markNotificationFailed
  // ---------------------------------------------------------------
  describe('markNotificationFailed', () => {
    it('marks notification as failed with attempt count', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const result = await markNotificationFailed('notif-1', 3)

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain("status = 'failed'")
      expect(sql).toContain('attempts = $1')
      expect(sql).toContain('last_attempt_at = NOW()')
      // Note: param order is [attempts, id]
      expect(mockQuery.mock.calls[0][1]).toEqual([3, 'notif-1'])
      expect(result).toBe(true)
    })

    it('returns false when notification not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await markNotificationFailed('nonexistent', 1)

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // incrementNotificationAttempt
  // ---------------------------------------------------------------
  describe('incrementNotificationAttempt', () => {
    it('increments attempts and sets next retry time', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const nextRetry = '2025-01-15T01:00:00Z'
      const result = await incrementNotificationAttempt('notif-1', 2, nextRetry)

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('attempts = $1')
      expect(sql).toContain('last_attempt_at = NOW()')
      expect(sql).toContain('next_retry_at = $2')
      // Note: param order is [attempts, nextRetryAt, id]
      expect(mockQuery.mock.calls[0][1]).toEqual([2, nextRetry, 'notif-1'])
      expect(result).toBe(true)
    })

    it('returns false when notification not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const result = await incrementNotificationAttempt('nonexistent', 1, '2025-01-15T01:00:00Z')

      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // createNotification
  // ---------------------------------------------------------------
  describe('createNotification', () => {
    it('creates a notification with all fields and returns it', async () => {
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] })
      // SELECT to return
      mockQuery.mockResolvedValueOnce({ rows: [notifRow] })

      const result = await createNotification({
        mentioned_agent_id: 'agent-a',
        from_agent_id: 'agent-b',
        task_id: 'task-1',
        content: 'Hey @agent-a, please review',
      })

      expect(mockQuery).toHaveBeenCalledTimes(2)

      const sql: string = mockQuery.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO notifications')

      const params = mockQuery.mock.calls[0][1]
      expect(params[0]).toBe('test-id-123') // generated id
      expect(params[1]).toBe('idem-key-abc') // idempotency key
      expect(params[2]).toBe('agent-a')
      expect(params[3]).toBe('agent-b')
      expect(params[4]).toBe('task-1')
      expect(params[5]).toBe('Hey @agent-a, please review')

      // Verify SELECT
      expect(mockQuery.mock.calls[1][0]).toContain('WHERE id = $1')
      expect(mockQuery.mock.calls[1][1]).toEqual(['test-id-123'])

      expect(result).toEqual(notifRow)
    })

    it('uses null for optional from_agent_id and task_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [notifRow] })

      await createNotification({
        mentioned_agent_id: 'agent-a',
        content: 'System notification',
      })

      const params = mockQuery.mock.calls[0][1]
      expect(params[3]).toBeNull() // from_agent_id
      expect(params[4]).toBeNull() // task_id
    })

    it('returns null on duplicate key error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))

      const result = await createNotification({
        mentioned_agent_id: 'agent-a',
        content: 'Duplicate',
      })

      expect(result).toBeNull()
    })

    it('rethrows non-duplicate errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'))

      await expect(
        createNotification({
          mentioned_agent_id: 'agent-a',
          content: 'Will fail',
        }),
      ).rejects.toThrow('connection refused')
    })
  })
})
