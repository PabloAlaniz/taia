import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependency service
const mockGetDependencies = vi.fn()
const mockAddTaskDependency = vi.fn()
const mockRemoveTaskDependency = vi.fn()

vi.mock('@taia/core/services/dependency.service', () => ({
  getDependencies: (...args: any[]) => mockGetDependencies(...args),
  addTaskDependency: (...args: any[]) => mockAddTaskDependency(...args),
  removeTaskDependency: (...args: any[]) => mockRemoveTaskDependency(...args),
}))

import { GET, POST, DELETE } from '@/app/api/tasks/[taskId]/dependencies/route'

beforeEach(() => {
  vi.clearAllMocks()
})

const context = (taskId: string) => ({
  params: Promise.resolve({ taskId }),
})

describe('GET /api/tasks/:taskId/dependencies', () => {
  it('returns blockers and dependents', async () => {
    mockGetDependencies.mockResolvedValue({
      blockers: [{ id: 'dep-1', task_id: 'task-a', depends_on_task_id: 'task-b' }],
      dependents: [],
    })

    const req = new NextRequest('http://localhost/api/tasks/task-a/dependencies')
    const res = await GET(req, context('task-a'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.blockers).toHaveLength(1)
    expect(data.dependents).toHaveLength(0)
  })

  it('returns 404 when task not found', async () => {
    mockGetDependencies.mockRejectedValue(new Error("Task 'nonexistent' not found"))

    const req = new NextRequest('http://localhost/api/tasks/nonexistent/dependencies')
    const res = await GET(req, context('nonexistent'))

    expect(res.status).toBe(500)
  })
})

describe('POST /api/tasks/:taskId/dependencies', () => {
  it('adds a dependency', async () => {
    mockAddTaskDependency.mockResolvedValue({
      id: 'dep-1',
      task_id: 'task-a',
      depends_on_task_id: 'task-b',
      created_at: new Date().toISOString(),
    })

    const req = new NextRequest('http://localhost/api/tasks/task-a/dependencies', {
      method: 'POST',
      body: JSON.stringify({ depends_on_task_id: 'task-b' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, context('task-a'))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.dependency.depends_on_task_id).toBe('task-b')
  })

  it('returns 400 for missing depends_on_task_id', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-a/dependencies', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, context('task-a'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/tasks/:taskId/dependencies', () => {
  it('removes a dependency', async () => {
    mockRemoveTaskDependency.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/tasks/task-a/dependencies', {
      method: 'DELETE',
      body: JSON.stringify({ depends_on_task_id: 'task-b' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await DELETE(req, context('task-a'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.removed).toBe(true)
  })

  it('returns 400 for missing depends_on_task_id', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-a/dependencies', {
      method: 'DELETE',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await DELETE(req, context('task-a'))
    expect(res.status).toBe(400)
  })
})
