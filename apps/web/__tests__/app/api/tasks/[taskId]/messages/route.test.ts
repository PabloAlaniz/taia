import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/message.service', () => ({
  listMessagesForTask: vi.fn(),
  createMessageForTask: vi.fn(),
}))

import { GET, POST } from '@/app/api/tasks/[taskId]/messages/route'
import * as messageService from '@taia/core/services/message.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (taskId: string) => ({
  params: { taskId },
})

describe('GET /api/tasks/[taskId]/messages', () => {
  it('returns messages for a task', async () => {
    const messages = [
      { id: 'm1', task_id: 'task-1', from_agent_id: 'agent-1', content: 'Hello' },
      { id: 'm2', task_id: 'task-1', from_agent_id: 'bob', content: 'Hi' },
    ]
    vi.mocked(messageService.listMessagesForTask).mockResolvedValue(messages as any)

    const req = new NextRequest('http://localhost/api/tasks/task-1/messages')
    const res = await GET(req, makeParams('task-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.messages).toHaveLength(2)
  })

  it('calls service with correct taskId', async () => {
    vi.mocked(messageService.listMessagesForTask).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/tasks/xyz/messages')
    await GET(req, makeParams('xyz'))

    expect(messageService.listMessagesForTask).toHaveBeenCalledWith('xyz')
  })

  it('returns error on service failure', async () => {
    vi.mocked(messageService.listMessagesForTask).mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/tasks/task-1/messages')
    const res = await GET(req, makeParams('task-1'))

    expect(res.status).toBe(500)
  })
})

describe('POST /api/tasks/[taskId]/messages', () => {
  it('creates a message', async () => {
    const message = { id: 'm1', task_id: 'task-1', from_agent_id: 'agent-1', content: 'New msg' }
    vi.mocked(messageService.createMessageForTask).mockResolvedValue(message as any)

    const req = new NextRequest('http://localhost/api/tasks/task-1/messages', {
      method: 'POST',
      body: JSON.stringify({ from_agent_id: 'agent-1', content: 'New msg' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('task-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message.content).toBe('New msg')
  })

  it('returns 400 for missing content', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-1/messages', {
      method: 'POST',
      body: JSON.stringify({ from_agent_id: 'agent-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('task-1'))

    expect(res.status).toBe(400)
  })
})
