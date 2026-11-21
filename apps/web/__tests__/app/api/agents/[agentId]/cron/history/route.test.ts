import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cron.service', () => ({
  getCronHistory: vi.fn(),
}))

import { GET } from '@/app/api/agents/[agentId]/cron/history/route'
import * as cronService from '@taia/core/services/cron.service'
import { NotFoundError } from '@taia/core/errors'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agents/[agentId]/cron/history', () => {
  it('returns cron history', async () => {
    vi.mocked(cronService.getCronHistory).mockResolvedValue({
      agentId: 'agent-1',
      cronId: 'cron-123',
      runs: [{ runId: 'r1', status: 'ok' }],
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron/history', {
      method: 'GET',
    })
    const res = await GET(req, { params: { agentId: 'agent-1' } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agentId).toBe('agent-1')
    expect(data.cronId).toBe('cron-123')
    expect(data.runs).toHaveLength(1)
    expect(data.runs[0]).toEqual({ runId: 'r1', status: 'ok' })
    expect(cronService.getCronHistory).toHaveBeenCalledWith('agent-1')
  })

  it('returns 404 when agent has no cron', async () => {
    vi.mocked(cronService.getCronHistory).mockRejectedValue(new NotFoundError('Cron', 'agent-1'))

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron/history', {
      method: 'GET',
    })
    const res = await GET(req, { params: { agentId: 'agent-1' } })
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('NOT_FOUND')
  })
})
