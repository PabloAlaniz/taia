import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, DELETE } from '@/app/api/tasks/[taskId]/tags/route'

vi.mock('@taia/core/services/activity.service', () => ({
  logTaskTagged: vi.fn(),
  logTaskUntagged: vi.fn(),
}))

vi.mock('@taia/core/db', () => ({
  getTaskById: vi.fn((id: string) => {
    if (id === 'task-123') {
      return { id: 'task-123', title: 'Test Task', tags: ['existing'] }
    }
    return null
  }),
  updateTask: vi.fn((id: string, updates: any) => ({
    id,
    title: 'Test Task',
    ...updates,
  })),
}))

const mockParams = (taskId: string) => Promise.resolve({ taskId })

describe('POST /api/tasks/[taskId]/tags', () => {
  it('adds tag to task', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-123/tags', {
      method: 'POST',
      body: JSON.stringify({ tag: 'urgent' }),
    })

    const res = await POST(req, { params: mockParams('task-123') })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.task.tags).toContain('urgent')
  })

  it('returns success if tag already exists', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-123/tags', {
      method: 'POST',
      body: JSON.stringify({ tag: 'existing' }),
    })

    const res = await POST(req, { params: mockParams('task-123') })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toContain('already exists')
  })

  it('returns 400 if tag missing', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-123/tags', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const res = await POST(req, { params: mockParams('task-123') })
    expect(res.status).toBe(400)
  })

  it('returns 404 if task not found', async () => {
    const req = new NextRequest('http://localhost/api/tasks/unknown/tags', {
      method: 'POST',
      body: JSON.stringify({ tag: 'test' }),
    })

    const res = await POST(req, { params: mockParams('unknown') })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tasks/[taskId]/tags', () => {
  it('removes tag from task', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-123/tags', {
      method: 'DELETE',
      body: JSON.stringify({ tag: 'existing' }),
    })

    const res = await DELETE(req, { params: mockParams('task-123') })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns success if tag not present', async () => {
    const req = new NextRequest('http://localhost/api/tasks/task-123/tags', {
      method: 'DELETE',
      body: JSON.stringify({ tag: 'nonexistent' }),
    })

    const res = await DELETE(req, { params: mockParams('task-123') })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toContain('not present')
  })

  it('returns 404 if task not found', async () => {
    const req = new NextRequest('http://localhost/api/tasks/unknown/tags', {
      method: 'DELETE',
      body: JSON.stringify({ tag: 'test' }),
    })

    const res = await DELETE(req, { params: mockParams('unknown') })
    expect(res.status).toBe(404)
  })
})
