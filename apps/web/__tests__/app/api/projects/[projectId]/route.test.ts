import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/project.service', () => ({
  getProject: vi.fn(),
  updateExistingProject: vi.fn(),
  deleteExistingProject: vi.fn(),
}))

import { GET, PUT, DELETE } from '@/app/api/projects/[projectId]/route'
import * as projectService from '@taia/core/services/project.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (projectId: string) => ({
  params: { projectId },
})

describe('GET /api/projects/[projectId]', () => {
  it('returns project by id', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue({ id: 'p1', name: 'MC' } as any)

    const req = new NextRequest('http://localhost/api/projects/p1')
    const res = await GET(req, makeParams('p1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.project.name).toBe('MC')
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/nope')
    const res = await GET(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/projects/[projectId]', () => {
  it('updates a project', async () => {
    vi.mocked(projectService.updateExistingProject).mockResolvedValue({
      id: 'p1',
      name: 'Updated',
    } as any)

    const req = new NextRequest('http://localhost/api/projects/p1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('p1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.project.name).toBe('Updated')
  })

  it('returns 404 when project to update not found', async () => {
    vi.mocked(projectService.updateExistingProject).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/nope', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/[projectId]', () => {
  it('deletes a project', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue({ id: 'p1' } as any)
    vi.mocked(projectService.deleteExistingProject).mockResolvedValue(undefined as any)

    const req = new NextRequest('http://localhost/api/projects/p1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('p1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when project to delete not found', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/nope', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})
