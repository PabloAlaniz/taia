import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/messages/route'

vi.mock('@taia/core/db', () => ({
  getMessagesForTask: vi.fn((taskId: string) => [
    {
      id: '1',
      task_id: taskId,
      from_agent_id: 'agent-1',
      content: 'Hello',
      created_at: '2026-01-01',
    },
  ]),
  createMessage: vi.fn((data) => ({ id: 'msg-1', ...data, created_at: new Date().toISOString() })),
}))

describe('GET /api/messages', () => {
  it('returns messages for task', async () => {
    const req = new NextRequest('http://localhost/api/messages?taskId=task-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.messages).toBeDefined()
    expect(data.messages[0].task_id).toBe('task-123')
  })

  it('returns 400 if taskId missing', async () => {
    const req = new NextRequest('http://localhost/api/messages')
    const res = await GET(req)

    expect(res.status).toBe(400)
  })
})

describe('POST /api/messages', () => {
  it('creates message with valid data', async () => {
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        task_id: 'task-123',
        from_agent_id: 'agent-1',
        content: 'Test message',
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message.content).toBe('Test message')
  })

  it('supports camelCase field names', async () => {
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 'task-123',
        fromAgentId: 'agent-5',
        content: 'CamelCase test',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 400 if content missing', async () => {
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        task_id: 'task-123',
        from_agent_id: 'agent-1',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: 'not json {{',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toContain('Invalid JSON')
  })
})
