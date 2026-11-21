import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/tasks/route'
import { createTask, getAllTasks } from '@taia/core/db'

vi.mock('@taia/core/services/activity.service', () => ({
  logTaskCreated: vi.fn(() => Promise.resolve()),
  logTaskUpdated: vi.fn(() => Promise.resolve()),
  logTaskMoved: vi.fn(() => Promise.resolve()),
  logTaskAssigned: vi.fn(() => Promise.resolve()),
  logTaskDeleted: vi.fn(() => Promise.resolve()),
  computeChanges: vi.fn(() => ({})),
}))

// Mock the db module
vi.mock('@taia/core/db', () => ({
  getAllTasks: vi.fn(() => [
    { id: '1', title: 'Test Task', status: 'INBOX', priority: 'MEDIUM' },
    { id: '2', title: 'Another Task', status: 'DONE', priority: 'HIGH' },
  ]),
  createTask: vi.fn((data) => ({ id: 'new-1', ...data, status: data.status || 'INBOX' })),
  moveTask: vi.fn((id, status) => ({ id, status })),
  updateTask: vi.fn((id, updates) => ({ id, ...updates })),
  deleteTask: vi.fn(),
}))

// Mock broadcast
// Workspaces without columns accept any status (task.service checks columns).
vi.mock('@taia/core/services/workspace.service', () => ({
  getWorkspaceColumns: vi.fn(async () => []),
  isDoneStatus: vi.fn(async () => false),
}))

vi.mock('@taia/core/broadcast', () => ({
  broadcastTaskUpdate: vi.fn(),
}))

// Mock activity service (called by task.service during create/update/move)
vi.mock('@taia/core/services/activity.service', () => ({
  logTaskCreated: vi.fn(),
  logTaskUpdated: vi.fn(),
  logTaskMoved: vi.fn(),
  logTaskAssigned: vi.fn(),
  logTaskDeleted: vi.fn(),
  computeChanges: vi.fn(() => ({})),
}))

describe('GET /api/tasks', () => {
  it('returns all tasks', async () => {
    const req = new NextRequest('http://localhost/api/tasks')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.tasks).toHaveLength(2)
    expect(data.total).toBe(2)
  })

  it('filters by status', async () => {
    const req = new NextRequest('http://localhost/api/tasks?status=inbox')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.tasks.every((t: any) => t.status === 'INBOX')).toBe(true)
  })

  it('lists every workspace when none is given', async () => {
    await GET(new NextRequest('http://localhost/api/tasks'))

    expect(vi.mocked(getAllTasks).mock.lastCall).toEqual([undefined])
  })

  it('scopes the list to the x-workspace-id header', async () => {
    await GET(
      new NextRequest('http://localhost/api/tasks', { headers: { 'x-workspace-id': 'ws-a' } }),
    )

    expect(vi.mocked(getAllTasks).mock.lastCall?.[0]).toMatchObject({ workspaceId: 'ws-a' })
  })

  it('prefers the workspace_id query parameter over the header', async () => {
    await GET(
      new NextRequest('http://localhost/api/tasks?workspace_id=ws-b', {
        headers: { 'x-workspace-id': 'ws-a' },
      }),
    )

    expect(vi.mocked(getAllTasks).mock.lastCall?.[0]).toMatchObject({ workspaceId: 'ws-b' })
  })
})

describe('POST /api/tasks', () => {
  function createRequest(task: Record<string, unknown>, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', task: { created_by: 'web-ui', ...task } }),
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  }

  it('creates the task in the workspace of the x-workspace-id header', async () => {
    const res = await POST(createRequest({ title: 'In A' }, { 'x-workspace-id': 'ws-a' }))

    expect(res.status).toBe(200)
    expect(vi.mocked(createTask).mock.lastCall?.[0]).toMatchObject({ workspace_id: 'ws-a' })
  })

  it('prefers the workspace_id of the task over the header', async () => {
    await POST(createRequest({ title: 'In B', workspace_id: 'ws-b' }, { 'x-workspace-id': 'ws-a' }))

    expect(vi.mocked(createTask).mock.lastCall?.[0]).toMatchObject({ workspace_id: 'ws-b' })
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: 'not valid json {{{',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBe('Invalid JSON')
  })

  it('creates a task with assigned_to', async () => {
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        task: {
          title: 'New Task',
          assigned_to: 'agent-5',
          created_by: 'web-ui',
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.task.title).toBe('New Task')
  })

  it('returns 400 for unknown action', async () => {
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ action: 'unknown' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
