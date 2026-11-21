import { describe, it, expect, vi } from 'vitest'
import { GET, PUT, DELETE } from '@/app/api/tasks/[taskId]/route'

vi.mock('@taia/core/services/activity.service', () => ({
  logTaskCreated: vi.fn(() => Promise.resolve()),
  logTaskUpdated: vi.fn(() => Promise.resolve()),
  logTaskMoved: vi.fn(() => Promise.resolve()),
  logTaskAssigned: vi.fn(() => Promise.resolve()),
  logTaskDeleted: vi.fn(() => Promise.resolve()),
  computeChanges: vi.fn(() => ({})),
}))

vi.mock('@taia/core/db', () => ({
  getTaskById: vi.fn((id: string) => {
    if (id === 'task-123') {
      return { id: 'task-123', title: 'Test Task', status: 'INBOX' }
    }
    return null
  }),
  updateTask: vi.fn((id: string, updates: any) => {
    if (id === 'task-123') {
      return { id: 'task-123', ...updates }
    }
    return null
  }),
  deleteTask: vi.fn((id: string) => id === 'task-123'),
}))

// Workspaces without columns accept any status (task.service checks columns).
vi.mock('@taia/core/services/workspace.service', () => ({
  getWorkspaceColumns: vi.fn(async () => []),
  isDoneStatus: vi.fn(async () => false),
}))

vi.mock('@taia/core/broadcast', () => ({
  broadcastTaskUpdate: vi.fn(),
}))

vi.mock('@taia/core/services/activity.service', () => ({
  logTaskCreated: vi.fn(),
  logTaskUpdated: vi.fn(),
  logTaskMoved: vi.fn(),
  logTaskAssigned: vi.fn(),
  logTaskDeleted: vi.fn(),
  computeChanges: vi.fn(() => ({})),
}))

const mockParams = (taskId: string) => ({ params: { taskId } })

describe('GET /api/tasks/[taskId]', () => {
  it('returns task when found', async () => {
    const req = new Request('http://localhost/api/tasks/task-123')
    const res = await GET(req, mockParams('task-123'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.task.id).toBe('task-123')
  })

  it('returns 404 when task not found', async () => {
    const req = new Request('http://localhost/api/tasks/unknown')
    const res = await GET(req, mockParams('unknown'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/tasks/[taskId]', () => {
  it('updates task and broadcasts', async () => {
    const req = new Request('http://localhost/api/tasks/task-123', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated Title', status: 'IN_PROGRESS' }),
    })

    const res = await PUT(req, mockParams('task-123'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when task not found', async () => {
    const req = new Request('http://localhost/api/tasks/unknown', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Test' }),
    })

    const res = await PUT(req, mockParams('unknown'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tasks/[taskId]', () => {
  it('deletes task and broadcasts', async () => {
    const req = new Request('http://localhost/api/tasks/task-123', { method: 'DELETE' })
    const res = await DELETE(req, mockParams('task-123'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when task not found', async () => {
    const req = new Request('http://localhost/api/tasks/unknown', { method: 'DELETE' })
    const res = await DELETE(req, mockParams('unknown'))

    expect(res.status).toBe(404)
  })
})
