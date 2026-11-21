import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cron.service', () => ({
  triggerCronRun: vi.fn(),
}))

import { POST } from '@/app/api/agents/[agentId]/cron/run/route'
import * as cronService from '@taia/core/services/cron.service'
import { NotFoundError } from '@taia/core/errors'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/agents/[agentId]/cron/run', () => {
  it('triggers cron run and returns success', async () => {
    vi.mocked(cronService.triggerCronRun).mockResolvedValue({
      agentId: 'agent-1',
      cronId: 'cron-123',
      triggered: true,
      result: {},
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron/run', {
      method: 'POST',
    })
    const res = await POST(req, { params: { agentId: 'agent-1' } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agentId).toBe('agent-1')
    expect(data.cronId).toBe('cron-123')
    expect(data.triggered).toBe(true)
    expect(cronService.triggerCronRun).toHaveBeenCalledWith('agent-1')
  })

  it('returns 404 when agent has no cron', async () => {
    vi.mocked(cronService.triggerCronRun).mockRejectedValue(new NotFoundError('Cron', 'agent-1'))

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron/run', {
      method: 'POST',
    })
    const res = await POST(req, { params: { agentId: 'agent-1' } })
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('NOT_FOUND')
  })
})
