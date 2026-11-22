import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/project.service', () => ({
  getProjectOverview: vi.fn(),
}))

import { GET } from '@/app/api/projects/[projectId]/overview/route'
import * as projectService from '@taia/core/services/project.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (projectId: string) => ({ params: { projectId } })

describe('GET /api/projects/[projectId]/overview', () => {
  it('returns the project grouped by workspace', async () => {
    vi.mocked(projectService.getProjectOverview).mockResolvedValue({
      project: { id: 'p1', name: 'Client' },
      repositories: [],
      workspaces: [{ workspace: { id: 'ws-a', name: 'A' }, columns: [], tasks: [] }],
    } as any)

    const res = await GET(
      new NextRequest('http://localhost/api/projects/p1/overview', {
        headers: { 'x-workspace-id': 'ws-other' },
      }),
      makeParams('p1') as any,
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.project.name).toBe('Client')
    expect(data.workspaces[0].workspace.id).toBe('ws-a')
    expect(projectService.getProjectOverview).toHaveBeenCalledWith('p1')
  })

  it('returns 404 for an unknown project', async () => {
    vi.mocked(projectService.getProjectOverview).mockResolvedValue(undefined)

    const res = await GET(
      new NextRequest('http://localhost/api/projects/nope/overview'),
      makeParams('nope') as any,
    )
    expect(res.status).toBe(404)
  })
})
