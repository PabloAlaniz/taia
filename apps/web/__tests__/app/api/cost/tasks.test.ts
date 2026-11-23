import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/db', () => ({
  getTaskCosts: vi.fn(),
}))

import { GET } from '@/app/api/cost/tasks/route'
import * as db from '@taia/core/db'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/cost/tasks', () => {
  it('returns the cost per task for the requested ids, deduplicated', async () => {
    vi.mocked(db.getTaskCosts).mockResolvedValue({ 't-1': 0.42 })

    const res = await GET(new NextRequest('http://localhost/api/cost/tasks?ids=t-1, t-2,t-1'), {
      params: Promise.resolve({}),
    })
    const data = await res.json()

    expect(db.getTaskCosts).toHaveBeenCalledWith(['t-1', 't-2'])
    expect(data).toEqual({ ok: true, costs: { 't-1': 0.42 } })
  })

  it('returns an empty map without ids', async () => {
    vi.mocked(db.getTaskCosts).mockResolvedValue({})
    const res = await GET(new NextRequest('http://localhost/api/cost/tasks'), {
      params: Promise.resolve({}),
    })
    expect((await res.json()).costs).toEqual({})
    expect(db.getTaskCosts).toHaveBeenCalledWith([])
  })

  it('rejects more than 500 ids', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `t-${i}`).join(',')
    const res = await GET(new NextRequest(`http://localhost/api/cost/tasks?ids=${ids}`), {
      params: Promise.resolve({}),
    })
    expect(res.status).toBe(400)
    expect(db.getTaskCosts).not.toHaveBeenCalled()
  })
})
