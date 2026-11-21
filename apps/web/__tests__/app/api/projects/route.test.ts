import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/project.service', () => ({
  listProjects: vi.fn(),
  createNewProject: vi.fn(),
}))

import { GET, POST } from '@/app/api/projects/route'
import * as projectService from '@taia/core/services/project.service'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/projects', () => {
  it('lists every workspace when none is given', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValue([])

    await GET(new NextRequest('http://localhost/api/projects'), { params: Promise.resolve({}) })

    expect(vi.mocked(projectService.listProjects)).toHaveBeenLastCalledWith(undefined)
  })

  it('scopes the list to the x-workspace-id header', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValue([])

    await GET(
      new NextRequest('http://localhost/api/projects', { headers: { 'x-workspace-id': 'ws-a' } }),
      { params: Promise.resolve({}) },
    )

    expect(vi.mocked(projectService.listProjects)).toHaveBeenLastCalledWith('ws-a')
  })

  it('prefers the workspace_id query parameter over the header', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValue([])

    await GET(
      new NextRequest('http://localhost/api/projects?workspace_id=ws-b', {
        headers: { 'x-workspace-id': 'ws-a' },
      }),
      { params: Promise.resolve({}) },
    )

    expect(vi.mocked(projectService.listProjects)).toHaveBeenLastCalledWith('ws-b')
  })

  it('returns all projects', async () => {
    vi.mocked(projectService.listProjects).mockResolvedValue([
      { id: 'p1', name: 'TAIA', slug: 'taia' },
    ] as any)

    const res = await GET(new NextRequest('http://localhost/api/projects'), {
      params: Promise.resolve({}),
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.projects).toHaveLength(1)
  })

  it('handles service errors', async () => {
    vi.mocked(projectService.listProjects).mockRejectedValue(new Error('DB error'))

    const res = await GET(new NextRequest('http://localhost/api/projects'), {
      params: Promise.resolve({}),
    })
    expect(res.status).toBe(500)
  })
})

describe('POST /api/projects', () => {
  it('creates a project', async () => {
    vi.mocked(projectService.createNewProject).mockResolvedValue({
      id: 'p1',
      name: 'New Project',
      slug: 'new-project',
    } as any)

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Project', slug: 'new-project' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.project.name).toBe('New Project')
  })

  it('returns 400 for invalid data', async () => {
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})
