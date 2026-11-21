import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetTaskById = vi.fn()
const mockGetSubtasksForTask = vi.fn()
const mockCreateSubtask = vi.fn()
const mockReorderSubtasks = vi.fn()

vi.mock('@taia/core/db', () => ({
  getTaskById: (...args: any[]) => mockGetTaskById(...args),
  getSubtasksForTask: (...args: any[]) => mockGetSubtasksForTask(...args),
  createSubtask: (...args: any[]) => mockCreateSubtask(...args),
  reorderSubtasks: (...args: any[]) => mockReorderSubtasks(...args),
}))

vi.mock('@taia/core/services/activity.service', () => ({
  logSubtaskCreated: vi.fn(),
}))

import { GET, POST } from '@/app/api/tasks/[taskId]/subtasks/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (taskId: string) => ({
  params: { taskId },
})

describe('GET /api/tasks/[taskId]/subtasks', () => {
  it('returns subtasks for a task', async () => {
    mockGetTaskById.mockResolvedValue({ id: 'task-1', title: 'Test' })
    mockGetSubtasksForTask.mockResolvedValue([
      { id: 's1', title: 'Subtask 1', completed: false },
      { id: 's2', title: 'Subtask 2', completed: true },
    ])

    const req = new NextRequest('http://localhost/api/tasks/task-1/subtasks')
    const res = await GET(req, makeParams('task-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.subtasks).toHaveLength(2)
  })

  it('returns 404 when task not found', async () => {
    mockGetTaskById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks/nope/subtasks')
    const res = await GET(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})

describe('POST /api/tasks/[taskId]/subtasks', () => {
  it('creates a subtask', async () => {
    mockGetTaskById.mockResolvedValue({ id: 'task-1', title: 'Test Task' })
    mockCreateSubtask.mockResolvedValue({
      id: 's1',
      task_id: 'task-1',
      title: 'New subtask',
      completed: false,
    })

    const req = new NextRequest('http://localhost/api/tasks/task-1/subtasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New subtask' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('task-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.subtask.title).toBe('New subtask')
  })

  it('returns 404 when parent task not found', async () => {
    mockGetTaskById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks/nope/subtasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })

  it('returns 400 for missing title', async () => {
    mockGetTaskById.mockResolvedValue({ id: 'task-1' })

    const req = new NextRequest('http://localhost/api/tasks/task-1/subtasks', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('task-1'))

    expect(res.status).toBe(400)
  })
})
