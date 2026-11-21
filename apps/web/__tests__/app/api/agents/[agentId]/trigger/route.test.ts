import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/trigger.service', () => ({
  triggerAgentHeartbeat: vi.fn(),
}))

import { POST } from '@/app/api/agents/[agentId]/trigger/route'
import * as triggerService from '@taia/core/services/trigger.service'

beforeEach(() => vi.clearAllMocks())

const makeContext = (agentId: string) => ({
  params: Promise.resolve({ agentId }),
})

describe('POST /api/agents/[agentId]/trigger', () => {
  it('triggers heartbeat successfully', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({
      ok: true,
      agentId: 'agent-1',
      message: 'Heartbeat triggered',
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/trigger', { method: 'POST' })
    const res = await POST(req, makeContext('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when no heartbeat configured', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({
      ok: false,
      error: 'No heartbeat configured for agent',
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/trigger', { method: 'POST' })
    const res = await POST(req, makeContext('agent-1'))

    expect(res.status).toBe(404)
  })

  it('returns 500 on generic error', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({
      ok: false,
      error: 'Gateway connection failed',
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/trigger', { method: 'POST' })
    const res = await POST(req, makeContext('agent-1'))

    expect(res.status).toBe(500)
  })

  it('passes correct agentId', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({ ok: true })

    const req = new NextRequest('http://localhost/api/agents/bob/trigger', { method: 'POST' })
    await POST(req, makeContext('bob'))

    expect(triggerService.triggerAgentHeartbeat).toHaveBeenCalledWith('bob', { force: false })
  })

  it('passes force=true through', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({ ok: true })

    const req = new NextRequest('http://localhost/api/agents/bob/trigger?force=true', {
      method: 'POST',
    })
    await POST(req, { params: Promise.resolve({ agentId: 'bob' }) })

    expect(triggerService.triggerAgentHeartbeat).toHaveBeenCalledWith('bob', { force: true })
  })
})
