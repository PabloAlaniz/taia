import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgentSessions = vi.fn()
const mockReadTranscript = vi.fn()

vi.mock('@taia/core/agent-runtime', () => ({
  getAgentSessions: (...args: any[]) => mockGetAgentSessions(...args),
  readTranscript: (...args: any[]) => mockReadTranscript(...args),
}))

import { GET } from '@/app/api/agents/[agentId]/live/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (agentId: string) => ({
  params: { agentId },
})

describe('GET /api/agents/[agentId]/live', () => {
  it('returns live status when session is recent', async () => {
    const now = Date.now()
    mockGetAgentSessions.mockResolvedValue([
      {
        sessionId: 's1',
        key: 'k1',
        label: 'main',
        model: 'claude-sonnet-4',
        updatedAt: now - 60000,
      },
    ])
    mockReadTranscript.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/live')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.status).toBe('live')
    expect(data.agentId).toBe('agent-1')
  })

  it('returns idle status for 5-minute-old session', async () => {
    const now = Date.now()
    mockGetAgentSessions.mockResolvedValue([
      { sessionId: 's1', key: 'k1', label: 'main', model: 'm', updatedAt: now - 5 * 60 * 1000 },
    ])
    mockReadTranscript.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/live')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(data.status).toBe('idle')
  })

  it('returns offline status for old session', async () => {
    mockGetAgentSessions.mockResolvedValue([
      {
        sessionId: 's1',
        key: 'k1',
        label: 'main',
        model: 'm',
        updatedAt: Date.now() - 20 * 60 * 1000,
      },
    ])
    mockReadTranscript.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/live')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(data.status).toBe('offline')
  })

  it('returns offline when no sessions found', async () => {
    mockGetAgentSessions.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/live')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(data.ok).toBe(false)
    expect(data.status).toBe('offline')
  })

  it('returns 500 on error', async () => {
    mockGetAgentSessions.mockRejectedValue(new Error('fail'))

    const req = new NextRequest('http://localhost/api/agents/agent-1/live')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.status).toBe('offline')
  })
})
