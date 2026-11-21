import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/notifications/route'

vi.mock('@taia/core/db', () => ({
  getUndeliveredNotifications: vi.fn(() => [
    { id: '1', mentioned_agent_id: 'agent-1', content: 'Hey!', delivered: 0 },
  ]),
  getNotificationsForAgent: vi.fn((agentId: string) => [
    { id: '2', mentioned_agent_id: agentId, content: 'For you', delivered: 1 },
  ]),
  markNotificationDelivered: vi.fn(() => true),
  markNotificationFailed: vi.fn(() => true),
  incrementNotificationAttempt: vi.fn(() => true),
  createNotification: vi.fn((data) => ({ id: 'new-1', ...data })),
}))

describe('GET /api/notifications', () => {
  it('returns undelivered notifications by default', async () => {
    const req = new NextRequest('http://localhost/api/notifications')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.notifications).toBeDefined()
    expect(data.notifications[0].delivered).toBe(0)
  })

  it('returns notifications for specific agent', async () => {
    const req = new NextRequest('http://localhost/api/notifications?agentId=agent-1')
    const res = await GET(req)
    const data = await res.json()

    expect(data.notifications[0].mentioned_agent_id).toBe('agent-1')
  })
})

describe('POST /api/notifications', () => {
  it('marks notification as delivered', async () => {
    const req = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'deliver', notificationId: '1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('marks notification as failed', async () => {
    const req = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'fail', notificationId: '1', attempts: 3 }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('creates notification', async () => {
    const req = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        mentioned_agent_id: 'agent-5',
        content: '@agent-5 check this',
        task_id: 'task-123',
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.notification).toBeDefined()
  })

  it('returns 400 if create missing required fields', async () => {
    const req = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', content: 'No agent' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown action', async () => {
    const req = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'unknown' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
