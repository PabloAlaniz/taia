import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/project.service', () => ({
  getProject: vi.fn(),
  listRepositories: vi.fn(),
  createNewRepository: vi.fn(),
}))

import { GET, POST } from '@/app/api/projects/[projectId]/repositories/route'
import * as projectService from '@taia/core/services/project.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (projectId: string) => ({
  params: { projectId },
})

describe('GET /api/projects/[projectId]/repositories', () => {
  it('returns repositories for a project', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue({ id: 'p1' } as any)
    vi.mocked(projectService.listRepositories).mockResolvedValue([
      { id: 'r1', name: 'main', url: 'https://github.com/org/repo' },
    ] as any)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories')
    const res = await GET(req, makeParams('p1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.repositories).toHaveLength(1)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/nope/repositories')
    const res = await GET(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})

describe('POST /api/projects/[projectId]/repositories', () => {
  it('creates a repository', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue({ id: 'p1' } as any)
    vi.mocked(projectService.createNewRepository).mockResolvedValue({
      id: 'r1',
      name: 'backend',
      url: 'https://github.com/org/backend',
    } as any)

    const req = new NextRequest('http://localhost/api/projects/p1/repositories', {
      method: 'POST',
      body: JSON.stringify({ name: 'backend', url: 'https://github.com/org/backend' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('p1'))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.repository.name).toBe('backend')
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/nope/repositories', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', url: 'https://github.com/o/x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})
