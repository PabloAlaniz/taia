import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/standup/route'

vi.mock('@taia/core/db', () => ({
  // No columns known: statuses are read by their names.
  getColumnStates: async () => [],
  getAllTasks: vi.fn(() => [
    { id: '1', title: 'Task Done', status: 'DONE', priority: 'HIGH' },
    {
      id: '2',
      title: 'In Progress Task',
      status: 'IN_PROGRESS',
      assigned_to: 'agent-1',
      priority: 'MEDIUM',
    },
    { id: '3', title: 'Review Task', status: 'REVIEW', priority: 'HIGH' },
    {
      id: '4',
      title: 'Blocked Task',
      status: 'IN_PROGRESS',
      tags: ['blocked'],
      assigned_to: 'agent-5',
      priority: 'URGENT',
    },
    { id: '5', title: 'Inbox Task', status: 'INBOX', priority: 'LOW' },
  ]),
  getActivities: vi.fn(() => [
    {
      id: 'a1',
      type: 'task_completed',
      agent_id: 'agent-1',
      task_id: '1',
      created_at: new Date().toISOString(),
    },
    { id: 'a2', type: 'message_sent', agent_id: 'agent-5', created_at: new Date().toISOString() },
  ]),
}))

describe('GET /api/standup', () => {
  it('returns standup as text by default', async () => {
    const req = new NextRequest('http://localhost/api/standup')
    const res = await GET(req)

    expect(res.headers.get('Content-Type')).toContain('text/plain')

    const text = await res.text()
    expect(text).toContain('DAILY STANDUP')
    expect(text).toContain('STATS')
  })

  it('returns JSON format when requested', async () => {
    const req = new NextRequest('http://localhost/api/standup?format=json')
    const res = await GET(req)
    const data = await res.json()

    expect(data.standup).toBeDefined()
    expect(data.stats).toBeDefined()
    expect(data.stats.total).toBe(5)
    expect(data.stats.done).toBe(1)
    expect(data.stats.inProgress).toBe(2)
    expect(data.stats.blocked).toBe(1)
  })

  it('includes blocked tasks section', async () => {
    const req = new NextRequest('http://localhost/api/standup')
    const res = await GET(req)
    const text = await res.text()

    expect(text).toContain('BLOQUEADO')
    expect(text).toContain('Blocked Task')
  })

  it('includes in progress tasks', async () => {
    const req = new NextRequest('http://localhost/api/standup')
    const res = await GET(req)
    const text = await res.text()

    expect(text).toContain('EN PROGRESO')
  })

  it('includes inbox count', async () => {
    const req = new NextRequest('http://localhost/api/standup')
    const res = await GET(req)
    const text = await res.text()

    expect(text).toContain('INBOX')
    expect(text).toContain('Inbox Task')
  })
})
