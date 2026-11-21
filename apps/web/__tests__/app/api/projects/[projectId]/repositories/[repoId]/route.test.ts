import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/project.service', () => ({
  getRepo: vi.fn(),
  updateExistingRepository: vi.fn(),
  deleteExistingRepository: vi.fn(),
}))

import { GET, PUT, DELETE } from '@/app/api/projects/[projectId]/repositories/[repoId]/route'
import * as projectService from '@taia/core/services/project.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (projectId: string, repoId: string) => ({
  params: { projectId, repoId },
})

describe('GET /api/projects/[projectId]/repositories/[repoId]', () => {
  it('returns repository when found and matches project', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue({
      id: 'r1',
      project_id: 'p1',
      name: 'main',
    } as any)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/r1')
    const res = await GET(req, makeParams('p1', 'r1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.repository.name).toBe('main')
  })

  it('returns 404 when repo belongs to different project', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue({
      id: 'r1',
      project_id: 'other-project',
      name: 'main',
    } as any)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/r1')
    const res = await GET(req, makeParams('p1', 'r1'))

    expect(res.status).toBe(404)
  })

  it('returns 404 when repo not found', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/nope')
    const res = await GET(req, makeParams('p1', 'nope'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/projects/[projectId]/repositories/[repoId]', () => {
  it('updates a repository', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue({
      id: 'r1',
      project_id: 'p1',
      name: 'old',
    } as any)
    vi.mocked(projectService.updateExistingRepository).mockResolvedValue({
      id: 'r1',
      name: 'updated',
    } as any)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/r1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('p1', 'r1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.repository.name).toBe('updated')
  })

  it('returns 404 when repo not found for update', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/nope', {
      method: 'PUT',
      body: JSON.stringify({ name: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('p1', 'nope'))

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/[projectId]/repositories/[repoId]', () => {
  it('deletes a repository', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue({
      id: 'r1',
      project_id: 'p1',
    } as any)
    vi.mocked(projectService.deleteExistingRepository).mockResolvedValue(undefined as any)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/r1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeParams('p1', 'r1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when repo not found for deletion', async () => {
    vi.mocked(projectService.getRepo).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories/nope', {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeParams('p1', 'nope'))

    expect(res.status).toBe(404)
  })
})
