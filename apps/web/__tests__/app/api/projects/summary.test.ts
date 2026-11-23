import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/db', () => ({
  getProjectSummaries: vi.fn().mockResolvedValue([
    {
      project_id: 'p1',
      total_tasks: 4,
      done_tasks: 1,
      workspaces: 2,
      cost_usd: 1.5,
      last_activity: null,
    },
  ]),
}))

import { GET } from '@/app/api/projects/summary/route'

describe('GET /api/projects/summary', () => {
  it('returns one summary per project', async () => {
    const res = await GET(new NextRequest('http://localhost/api/projects/summary'), {
      params: Promise.resolve({}),
    })
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.summaries[0]).toMatchObject({ project_id: 'p1', total_tasks: 4, workspaces: 2 })
  })
})
