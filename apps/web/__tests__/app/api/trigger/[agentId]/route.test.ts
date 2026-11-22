import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/trigger.service', () => ({
  triggerAgentHeartbeat: vi.fn(),
}))

import { GET, POST } from '@/app/api/trigger/[agentId]/route'
import * as triggerService from '@taia/core/services/trigger.service'

beforeEach(() => vi.clearAllMocks())

const makeParams = (agentId: string) => ({
  params: { agentId },
})

describe('POST /api/trigger/[agentId]', () => {
  it('triggers heartbeat successfully', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({ ok: true })

    const req = new NextRequest('http://localhost/api/trigger/agent-1', { method: 'POST' })
    const res = await POST(req, makeParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('answers 429 with Retry-After when a spend limit refused the run', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({
      ok: false,
      agentId: 'agent-1',
      error: 'Too many agent-run requests; try again in 120s',
      retryAfterSeconds: 120,
    })

    const req = new NextRequest('http://localhost/api/trigger/agent-1', { method: 'POST' })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('120')
  })

  it('answers 200 with the running session when the trigger is coalesced', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({
      ok: true,
      agentId: 'agent-1',
      coalesced: true,
      sessionKey: 'sess-1',
    })

    const req = new NextRequest('http://localhost/api/trigger/agent-1', { method: 'POST' })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ coalesced: true, sessionKey: 'sess-1' })
  })

  it('returns 404 when no heartbeat configured', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({
      ok: false,
      error: 'No heartbeat configured',
    })

    const req = new NextRequest('http://localhost/api/trigger/agent-1', { method: 'POST' })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })
})

describe('GET /api/trigger/[agentId]', () => {
  it('returns usage info when run param is not set', async () => {
    const req = new NextRequest('http://localhost/api/trigger/agent-1')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(data.endpoint).toBe('trigger')
    expect(data.agentId).toBe('agent-1')
  })

  it('triggers heartbeat when run=true', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({ ok: true })

    const req = new NextRequest('http://localhost/api/trigger/agent-1?run=true')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(triggerService.triggerAgentHeartbeat).toHaveBeenCalledWith('agent-1', { force: false })
  })

  it('passes force=1 through', async () => {
    vi.mocked(triggerService.triggerAgentHeartbeat).mockResolvedValue({ ok: true })

    const req = new NextRequest('http://localhost/api/trigger/agent-1?run=true&force=1')
    await GET(req, makeParams('agent-1'))

    expect(triggerService.triggerAgentHeartbeat).toHaveBeenCalledWith('agent-1', { force: true })
  })
})
