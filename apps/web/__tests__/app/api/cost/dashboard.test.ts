import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cost.service', () => ({
  getDashboardMetrics: vi.fn(),
}))

import { GET } from '@/app/api/cost/dashboard/route'
import * as costService from '@taia/core/services/cost.service'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/cost/dashboard', () => {
  it('returns dashboard metrics with default period', async () => {
    const mockMetrics = {
      totals: { total_tokens: 100000, total_cost_usd: 0.6, session_count: 5 },
      by_model: [],
      by_agent: [],
      daily_trend: [],
    }
    vi.mocked(costService.getDashboardMetrics).mockResolvedValue(mockMetrics)

    const req = new NextRequest('http://localhost/api/cost/dashboard')
    const res = await GET(req)
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.metrics.totals.total_tokens).toBe(100000)
  })

  it('accepts period parameter', async () => {
    const mockMetrics = {
      totals: { total_tokens: 0, total_cost_usd: 0, session_count: 0 },
      by_model: [],
      by_agent: [],
      daily_trend: [],
    }
    vi.mocked(costService.getDashboardMetrics).mockResolvedValue(mockMetrics)

    const req = new NextRequest('http://localhost/api/cost/dashboard?period=24h')
    await GET(req)

    expect(costService.getDashboardMetrics).toHaveBeenCalledWith('24h')
  })

  it('returns 400 for invalid period', async () => {
    const req = new NextRequest('http://localhost/api/cost/dashboard?period=invalid')
    const res = await GET(req)

    expect(res.status).toBe(400)
  })
})
