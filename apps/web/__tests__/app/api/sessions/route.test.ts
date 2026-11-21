import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockListSessions = vi.fn()

vi.mock('@taia/core/services/session.service', () => ({
  listSessions: (...args: any[]) => mockListSessions(...args),
}))

import { GET } from '@/app/api/sessions/route'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/sessions', () => {
  it('returns sessions list', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        agentId: 'dev',
        status: 'live',
        updatedAt: Date.now(),
        lastActivityAgo: '1m ago',
      },
    ])

    const req = new NextRequest('http://localhost/api/sessions')
    const res = await GET(req, { params: Promise.resolve({}) })
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.sessions).toHaveLength(1)
    expect(data.sessions[0].agentId).toBe('dev')
  })

  it('passes query params to service', async () => {
    mockListSessions.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/sessions?agent_id=qa&status=active&limit=10')
    await GET(req, { params: Promise.resolve({}) })

    expect(mockListSessions).toHaveBeenCalledWith({
      agentId: 'qa',
      status: 'active',
      limit: 10,
    })
  })

  it('uses defaults when no params', async () => {
    mockListSessions.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/sessions')
    await GET(req, { params: Promise.resolve({}) })

    expect(mockListSessions).toHaveBeenCalledWith({
      agentId: undefined,
      status: 'all',
      limit: 50,
    })
  })

  it('returns 400 for invalid params', async () => {
    const req = new NextRequest('http://localhost/api/sessions?limit=9999')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(400)
  })

  it('returns 500 on service error', async () => {
    mockListSessions.mockRejectedValue(new Error('Gateway down'))

    const req = new NextRequest('http://localhost/api/sessions')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.ok).toBe(false)
  })
})
