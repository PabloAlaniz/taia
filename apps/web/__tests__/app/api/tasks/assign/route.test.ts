import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/tasks/assign/route'

vi.mock('@taia/core/services/task.service', () => ({
  getTask: vi.fn((id: string) => {
    if (id === 'task-123') {
      return { id: 'task-123', title: 'Test Task', status: 'INBOX' }
    }
    return undefined
  }),
  assignTaskWithBroadcast: vi.fn((taskId: string, agentId: string) => ({
    id: taskId,
    title: 'Test Task',
    status: 'ASSIGNED',
    assigned_to: agentId,
  })),
}))

vi.mock('@taia/core/db', () => ({
  getAgentById: vi.fn((id: string) => {
    if (id === 'agent-1' || id === 'agent-5') {
      return { id, name: 'Test Agent', role: 'Developer' }
    }
    return null
  }),
}))

vi.mock('@taia/core/broadcast', () => ({
  broadcastTaskUpdate: vi.fn(),
  broadcastAgentStatus: vi.fn(),
  broadcastActivity: vi.fn(),
}))

vi.mock('@taia/core/services/activity.service', () => ({
  logTaskAssigned: vi.fn(),
}))

describe('POST /api/tasks/assign', () => {
  it('assigns task to agent', async () => {
    const req = new NextRequest('http://localhost/api/tasks/assign', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-123', agentId: 'agent-1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.task.assigned_to).toBe('agent-1')
    expect(data.task.status).toBe('ASSIGNED')
  })

  it('returns 404 when task not found', async () => {
    const req = new NextRequest('http://localhost/api/tasks/assign', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'unknown', agentId: 'agent-1' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('includes spawn note in response', async () => {
    const req = new NextRequest('http://localhost/api/tasks/assign', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-123', agentId: 'agent-5' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(data.note).toContain('spawn')
  })
})
