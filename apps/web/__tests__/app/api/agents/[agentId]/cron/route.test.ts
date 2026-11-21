import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/cron.service', () => ({
  getCronForAgent: vi.fn(),
  createCron: vi.fn(),
  updateCron: vi.fn(),
  removeCron: vi.fn(),
}))

import { GET, POST, PATCH, DELETE } from '@/app/api/agents/[agentId]/cron/route'
import * as cronService from '@taia/core/services/cron.service'
import { NotFoundError } from '@taia/core/errors'

const mockParams = (agentId: string) => ({ params: { agentId } })

const fakeCron = {
  agentId: 'agent-1',
  cronId: 'cron-123',
  enabled: true,
  schedule: '0 6 * * *',
  tz: 'UTC',
  nextRun: '2026-02-15T06:00:00.000Z',
  lastRun: '2026-02-14T18:00:00.000Z',
  lastStatus: 'ok',
  lastError: null,
  lastDurationMs: 1200,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agents/[agentId]/cron', () => {
  it('returns cron data for agent', async () => {
    vi.mocked(cronService.getCronForAgent).mockResolvedValue(fakeCron)

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron')
    const res = await GET(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agentId).toBe('agent-1')
    expect(data.schedule).toBe('0 6 * * *')
    expect(data.enabled).toBe(true)
    expect(cronService.getCronForAgent).toHaveBeenCalledWith('agent-1')
  })

  it('returns 404 when cron job not found', async () => {
    vi.mocked(cronService.getCronForAgent).mockRejectedValue(
      new NotFoundError('Cron job', 'agent-1'),
    )

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron')
    const res = await GET(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
    expect(data.error).toContain('not found')
  })
})

describe('POST /api/agents/[agentId]/cron', () => {
  it('creates cron with valid schedule', async () => {
    const created = { id: 'cron-456', agentId: 'agent-1' }
    vi.mocked(cronService.createCron).mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'POST',
      body: JSON.stringify({ schedule: '0 6 * * *' }),
    })
    const res = await POST(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.created).toBe(true)
    expect(cronService.createCron).toHaveBeenCalledWith({
      agentId: 'agent-1',
      schedule: '0 6 * * *',
    })
  })

  it('creates cron with all optional fields', async () => {
    const created = { id: 'cron-789', agentId: 'agent-1' }
    vi.mocked(cronService.createCron).mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'POST',
      body: JSON.stringify({
        schedule: '30 2 * * 1',
        enabled: false,
        timeoutSeconds: 120,
      }),
    })
    const res = await POST(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(cronService.createCron).toHaveBeenCalledWith({
      agentId: 'agent-1',
      schedule: '30 2 * * 1',
      enabled: false,
      timeoutSeconds: 120,
    })
  })

  it('returns 400 for invalid cron expression', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'POST',
      body: JSON.stringify({ schedule: 'not-a-cron' }),
    })
    const res = await POST(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(cronService.createCron).not.toHaveBeenCalled()
  })

  it('returns 400 when schedule is missing', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(cronService.createCron).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/agents/[agentId]/cron', () => {
  it('updates cron enabled status', async () => {
    const updated = {
      agentId: 'agent-1',
      cronId: 'cron-123',
      enabled: false,
      schedule: '0 6 * * *',
    }
    vi.mocked(cronService.updateCron).mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    })
    const res = await PATCH(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.enabled).toBe(false)
    expect(cronService.updateCron).toHaveBeenCalledWith('agent-1', { enabled: false })
  })

  it('updates cron schedule', async () => {
    const updated = {
      agentId: 'agent-1',
      cronId: 'cron-123',
      enabled: true,
      schedule: '0 0 * * *',
    }
    vi.mocked(cronService.updateCron).mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'PATCH',
      body: JSON.stringify({ schedule: '0 0 * * *' }),
    })
    const res = await PATCH(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.schedule).toBe('0 0 * * *')
    expect(cronService.updateCron).toHaveBeenCalledWith('agent-1', { schedule: '0 0 * * *' })
  })

  it('returns 400 for invalid schedule format', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'PATCH',
      body: JSON.stringify({ schedule: 'every-5-minutes' }),
    })
    const res = await PATCH(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(cronService.updateCron).not.toHaveBeenCalled()
  })

  it('returns 404 when cron job not found for update', async () => {
    vi.mocked(cronService.updateCron).mockRejectedValue(new NotFoundError('Cron job', 'unknown'))

    const req = new NextRequest('http://localhost/api/agents/unknown/cron', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    })
    const res = await PATCH(req, mockParams('unknown'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
  })
})

describe('DELETE /api/agents/[agentId]/cron', () => {
  it('removes cron and returns success', async () => {
    vi.mocked(cronService.removeCron).mockResolvedValue({
      agentId: 'agent-1',
      cronId: 'cron-123',
      removed: true,
    })

    const req = new NextRequest('http://localhost/api/agents/agent-1/cron', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.removed).toBe(true)
    expect(data.agentId).toBe('agent-1')
    expect(cronService.removeCron).toHaveBeenCalledWith('agent-1')
  })

  it('returns 404 when cron job not found for deletion', async () => {
    vi.mocked(cronService.removeCron).mockRejectedValue(new NotFoundError('Cron job', 'unknown'))

    const req = new NextRequest('http://localhost/api/agents/unknown/cron', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('unknown'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
    expect(data.error).toContain('not found')
  })
})
