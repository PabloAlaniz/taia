import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cost.service', () => ({
  getTaskCostBreakdown: vi.fn(),
}))

import { GET } from '@/app/api/tasks/[taskId]/cost/route'
import * as costService from '@taia/core/services/cost.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (taskId: string) => ({
  params: { taskId },
})

describe('GET /api/tasks/[taskId]/cost', () => {
  it('returns task cost breakdown', async () => {
    const breakdown = {
      task_id: 'task-1',
      total_tokens: 10000,
      total_cost_usd: 0.06,
      session_count: 2,
      sessions: [
        {
          id: 's1',
          session_key: 'key1',
          model: 'claude-sonnet-4',
          total_tokens: 5000,
          estimated_cost_usd: 0.03,
        },
      ],
    }
    vi.mocked(costService.getTaskCostBreakdown).mockResolvedValue(breakdown as any)

    const req = new NextRequest('http://localhost/api/tasks/task-1/cost')
    const res = await GET(req, makeParams('task-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.cost.task_id).toBe('task-1')
    expect(data.cost.total_tokens).toBe(10000)
  })

  it('calls getTaskCostBreakdown with correct taskId', async () => {
    vi.mocked(costService.getTaskCostBreakdown).mockResolvedValue({
      task_id: 'xyz',
      total_tokens: 0,
      total_cost_usd: 0,
      session_count: 0,
      sessions: [],
    })

    const req = new NextRequest('http://localhost/api/tasks/xyz/cost')
    await GET(req, makeParams('xyz'))

    expect(costService.getTaskCostBreakdown).toHaveBeenCalledWith('xyz')
  })

  it('handles service errors', async () => {
    vi.mocked(costService.getTaskCostBreakdown).mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/tasks/task-1/cost')
    const res = await GET(req, makeParams('task-1'))

    expect(res.status).toBe(500)
  })
})
