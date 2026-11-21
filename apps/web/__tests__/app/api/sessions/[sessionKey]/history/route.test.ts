import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetSessionDetail = vi.fn()

vi.mock('@taia/core/services/session.service', () => ({
  getSessionDetail: (...args: any[]) => mockGetSessionDetail(...args),
}))

import { GET } from '@/app/api/sessions/[sessionKey]/history/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (sessionKey: string) => ({
  params: Promise.resolve({ sessionKey }),
})

describe('GET /api/sessions/[sessionKey]/history', () => {
  it('returns session detail with messages', async () => {
    mockGetSessionDetail.mockResolvedValue({
      key: 'agent:dev:main',
      sessionId: 's1',
      agentId: 'dev',
      agentName: 'Developer',
      model: 'claude-sonnet-4',
      status: 'live',
      messages: [
        { id: 'm1', role: 'user', text: 'Hello' },
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there' }] },
      ],
      totalTokens: 5000,
      estimatedCostUsd: 0.05,
    })

    const req = new NextRequest('http://localhost/api/sessions/agent%3Adev%3Amain/history')
    const res = await GET(req, makeParams('agent%3Adev%3Amain'))
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.agentId).toBe('dev')
    expect(data.messages).toHaveLength(2)
    expect(data.totalTokens).toBe(5000)
  })

  it('returns 404 when session not found', async () => {
    mockGetSessionDetail.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/sessions/nonexistent/history')
    const res = await GET(req, makeParams('nonexistent'))

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.ok).toBe(false)
  })

  it('passes query params to service', async () => {
    mockGetSessionDetail.mockResolvedValue({
      key: 'k',
      sessionId: 's',
      agentId: 'a',
      status: 'offline',
      messages: [],
    })

    const req = new NextRequest(
      'http://localhost/api/sessions/key/history?limit=50&include_tools=false',
    )
    await GET(req, makeParams('key'))

    expect(mockGetSessionDetail).toHaveBeenCalledWith('key', {
      limit: 50,
      includeTools: false,
    })
  })

  it('decodes URL-encoded session key', async () => {
    mockGetSessionDetail.mockResolvedValue({
      key: 'agent:dev:main',
      sessionId: 's',
      agentId: 'dev',
      status: 'offline',
      messages: [],
    })

    const req = new NextRequest('http://localhost/api/sessions/agent%3Adev%3Amain/history')
    await GET(req, makeParams('agent%3Adev%3Amain'))

    expect(mockGetSessionDetail).toHaveBeenCalledWith('agent:dev:main', expect.any(Object))
  })

  it('returns 500 on service error', async () => {
    mockGetSessionDetail.mockRejectedValue(new Error('Gateway error'))

    const req = new NextRequest('http://localhost/api/sessions/key/history')
    const res = await GET(req, makeParams('key'))

    expect(res.status).toBe(500)
  })
})
