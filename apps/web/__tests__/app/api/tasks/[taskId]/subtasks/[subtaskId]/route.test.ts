import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetTaskById = vi.fn()
const mockGetSubtaskById = vi.fn()
const mockUpdateSubtask = vi.fn()
const mockDeleteSubtask = vi.fn()

vi.mock('@taia/core/db', () => ({
  getTaskById: (...args: any[]) => mockGetTaskById(...args),
  getSubtaskById: (...args: any[]) => mockGetSubtaskById(...args),
  updateSubtask: (...args: any[]) => mockUpdateSubtask(...args),
  deleteSubtask: (...args: any[]) => mockDeleteSubtask(...args),
}))

vi.mock('@taia/core/services/activity.service', () => ({
  logSubtaskCompleted: vi.fn(),
  logSubtaskDeleted: vi.fn(),
}))

import { PUT, DELETE } from '@/app/api/tasks/[taskId]/subtasks/[subtaskId]/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (taskId: string, subtaskId: string) => ({
  params: { taskId, subtaskId },
})

describe('PUT /api/tasks/[taskId]/subtasks/[subtaskId]', () => {
  it('updates a subtask', async () => {
    mockGetSubtaskById.mockResolvedValue({ id: 's1', title: 'Old', completed: false })
    mockUpdateSubtask.mockResolvedValue({ id: 's1', title: 'Updated', completed: false })

    const req = new NextRequest('http://localhost/api/tasks/t1/subtasks/s1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('t1', 's1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.subtask.title).toBe('Updated')
  })

  it('returns 404 when subtask not found', async () => {
    mockGetSubtaskById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks/t1/subtasks/nope', {
      method: 'PUT',
      body: JSON.stringify({ title: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('t1', 'nope'))

    expect(res.status).toBe(404)
  })

  it('logs activity when completion changes', async () => {
    mockGetSubtaskById.mockResolvedValue({ id: 's1', title: 'Sub', completed: false })
    mockUpdateSubtask.mockResolvedValue({ id: 's1', title: 'Sub', completed: true })
    mockGetTaskById.mockResolvedValue({ id: 't1', title: 'Parent Task' })

    const { logSubtaskCompleted } = await import('@taia/core/services/activity.service')

    const req = new NextRequest('http://localhost/api/tasks/t1/subtasks/s1', {
      method: 'PUT',
      body: JSON.stringify({ completed: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(req, makeParams('t1', 's1'))

    expect(logSubtaskCompleted).toHaveBeenCalled()
  })
})

describe('DELETE /api/tasks/[taskId]/subtasks/[subtaskId]', () => {
  it('deletes a subtask', async () => {
    mockGetSubtaskById.mockResolvedValue({ id: 's1', title: 'Sub' })
    mockGetTaskById.mockResolvedValue({ id: 't1', title: 'Task' })
    mockDeleteSubtask.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/tasks/t1/subtasks/s1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('t1', 's1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when subtask not found for deletion', async () => {
    mockGetSubtaskById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks/t1/subtasks/nope', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('t1', 'nope'))

    expect(res.status).toBe(404)
  })
})
