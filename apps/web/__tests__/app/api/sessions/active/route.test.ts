import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetActiveSessions = vi.fn()

vi.mock('@taia/core/services/session.service', () => ({
  getActiveSessions: (...args: any[]) => mockGetActiveSessions(...args),
}))

import { GET } from '@/app/api/sessions/active/route'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/sessions/active', () => {
  it('returns active sessions with timestamp', async () => {
    mockGetActiveSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        agentId: 'dev',
        agentName: 'Developer',
        status: 'live',
        recentTools: ['read_file'],
        updatedAt: Date.now(),
        lastActivityAgo: '30s ago',
      },
    ])

    const req = new NextRequest('http://localhost/api/sessions/active')
    const res = await GET(req, { params: Promise.resolve({}) })
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.active).toHaveLength(1)
    expect(data.active[0].agentId).toBe('dev')
    expect(data.timestamp).toBeDefined()
  })

  it('returns empty array when no active sessions', async () => {
    mockGetActiveSessions.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/sessions/active')
    const res = await GET(req, { params: Promise.resolve({}) })
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.active).toEqual([])
  })

  it('returns 500 on service error', async () => {
    mockGetActiveSessions.mockRejectedValue(new Error('fail'))

    const req = new NextRequest('http://localhost/api/sessions/active')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(500)
  })
})
