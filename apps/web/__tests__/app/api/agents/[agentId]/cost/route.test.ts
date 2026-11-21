import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cost.service', () => ({
  getAgentCostSummary: vi.fn(),
}))

import { GET } from '@/app/api/agents/[agentId]/cost/route'
import * as costService from '@taia/core/services/cost.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (agentId: string) => ({
  params: { agentId },
})

describe('GET /api/agents/[agentId]/cost', () => {
  it('returns agent cost summary', async () => {
    const summary = {
      agent_id: 'agent-1',
      total_tokens: 50000,
      total_cost_usd: 0.3,
      session_count: 3,
      by_model: [{ model: 'claude-sonnet-4', tokens: 50000, cost_usd: 0.3 }],
    }
    vi.mocked(costService.getAgentCostSummary).mockResolvedValue(summary)

    const req = new NextRequest('http://localhost/api/agents/agent-1/cost')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.cost.agent_id).toBe('agent-1')
    expect(data.cost.total_tokens).toBe(50000)
  })

  it('passes period parameter', async () => {
    vi.mocked(costService.getAgentCostSummary).mockResolvedValue({
      agent_id: 'agent-1',
      total_tokens: 0,
      total_cost_usd: 0,
      session_count: 0,
      by_model: [],
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/cost?period=24h')
    await GET(req, makeParams('agent-1'))

    expect(costService.getAgentCostSummary).toHaveBeenCalledWith('agent-1', '24h')
  })

  it('handles service errors', async () => {
    vi.mocked(costService.getAgentCostSummary).mockRejectedValue(new Error('DB down'))

    const req = new NextRequest('http://localhost/api/agents/agent-1/cost')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(500)
  })
})
