import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cost.service', () => ({
  syncAllCosts: vi.fn(),
  syncAgentCosts: vi.fn(),
}))

import { POST } from '@/app/api/cost/sync/route'
import * as costService from '@taia/core/services/cost.service'

beforeEach(() => vi.clearAllMocks())

describe('POST /api/cost/sync', () => {
  it('syncs all costs when no body', async () => {
    vi.mocked(costService.syncAllCosts).mockResolvedValue({ synced: 10, errors: 0 })

    const req = new NextRequest('http://localhost/api/cost/sync', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()

    expect(data.synced).toBe(10)
  })

  it('syncs specific agent costs when agentId provided', async () => {
    vi.mocked(costService.syncAgentCosts).mockResolvedValue({ synced: 3, errors: 0 })

    const req = new NextRequest('http://localhost/api/cost/sync', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'agent-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    await res.json()

    expect(costService.syncAgentCosts).toHaveBeenCalledWith('agent-1')
  })
})
