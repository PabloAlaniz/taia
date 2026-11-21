import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/activities/route'

vi.mock('@taia/core/db', () => ({
  getActivities: vi.fn((limit: number) =>
    [
      { id: '1', type: 'task_created', message: 'Task created', created_at: '2026-01-01' },
      { id: '2', type: 'task_moved', message: 'Task moved', created_at: '2026-01-02' },
    ].slice(0, limit),
  ),
  getBoardActivities: vi.fn(async (_limit: number, workspaceId: string) => [
    { id: 'ws-1', type: 'task_created', message: 'Scoped', workspace_id: workspaceId },
  ]),
  logActivity: vi.fn((data) => ({ id: 'new-1', ...data, created_at: new Date().toISOString() })),
}))

describe('GET /api/activities', () => {
  it('returns activities with default limit', async () => {
    const req = new NextRequest('http://localhost/api/activities')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.activities).toBeDefined()
    expect(Array.isArray(data.activities)).toBe(true)
  })

  it('lists the feed of the workspace in the x-workspace-id header', async () => {
    const req = new NextRequest('http://localhost/api/activities', {
      headers: { 'x-workspace-id': 'ws-a' },
    })
    const data = await (await GET(req)).json()

    expect(data.activities).toEqual([expect.objectContaining({ workspace_id: 'ws-a' })])
  })

  it('prefers the workspace_id query parameter over the header', async () => {
    const req = new NextRequest('http://localhost/api/activities?workspace_id=ws-b', {
      headers: { 'x-workspace-id': 'ws-a' },
    })
    const data = await (await GET(req)).json()

    expect(data.activities).toEqual([expect.objectContaining({ workspace_id: 'ws-b' })])
  })

  it('respects limit parameter', async () => {
    const req = new NextRequest('http://localhost/api/activities?limit=1')
    const res = await GET(req)
    const data = await res.json()

    expect(data.activities.length).toBeLessThanOrEqual(1)
  })
})

describe('POST /api/activities', () => {
  it('creates activity with valid data', async () => {
    const req = new NextRequest('http://localhost/api/activities', {
      method: 'POST',
      body: JSON.stringify({
        type: 'task_created',
        message: 'New task created',
        agent_id: 'agent-1',
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.activity).toBeDefined()
    expect(data.activity.type).toBe('task_created')
  })

  it('returns 400 if type missing', async () => {
    const req = new NextRequest('http://localhost/api/activities', {
      method: 'POST',
      body: JSON.stringify({ message: 'No type' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 if message missing', async () => {
    const req = new NextRequest('http://localhost/api/activities', {
      method: 'POST',
      body: JSON.stringify({ type: 'test' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('supports camelCase field names', async () => {
    const req = new NextRequest('http://localhost/api/activities', {
      method: 'POST',
      body: JSON.stringify({
        type: 'task_moved',
        message: 'Moved',
        agentId: 'agent-5',
        taskId: 'task-123',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
