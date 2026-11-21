import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgentSessions = vi.fn()
const mockReadTranscript = vi.fn()

vi.mock('@taia/core/agent-runtime', () => ({
  getAgentSessions: (...args: any[]) => mockGetAgentSessions(...args),
  readTranscript: (...args: any[]) => mockReadTranscript(...args),
}))

import { GET } from '@/app/api/agents/[agentId]/transcript/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (agentId: string) => ({
  params: { agentId },
})

describe('GET /api/agents/[agentId]/transcript', () => {
  it('returns simplified transcript entries', async () => {
    mockGetAgentSessions.mockResolvedValue([
      { sessionId: 'sess-1', key: 'agent:agent-1:main', model: 'claude-sonnet-4', updatedAt: 1000 },
    ])
    mockReadTranscript.mockResolvedValue([
      { role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there' }],
        model: 'claude-sonnet-4',
        timestamp: '2025-01-01T00:00:01Z',
      },
    ])

    const req = new NextRequest('http://localhost/api/agents/agent-1/transcript')
    const res = await GET(req, makeParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agentId).toBe('agent-1')
    expect(data.entries).toHaveLength(2)
    expect(data.entries[0].role).toBe('user')
    expect(data.entries[1].role).toBe('assistant')
  })

  it('returns 404 when no sessions found', async () => {
    mockGetAgentSessions.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/transcript')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('uses most recent session by updatedAt', async () => {
    mockGetAgentSessions.mockResolvedValue([
      { sessionId: 'old', key: 'k1', model: 'm', updatedAt: 100 },
      { sessionId: 'new', key: 'k2', model: 'm', updatedAt: 200 },
    ])
    mockReadTranscript.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/transcript')
    await GET(req, makeParams('agent-1'))

    expect(mockReadTranscript).toHaveBeenCalledWith('agent-1', 'new', 20)
  })

  it('returns 500 on error', async () => {
    mockGetAgentSessions.mockRejectedValue(new Error('Connection failed'))

    const req = new NextRequest('http://localhost/api/agents/agent-1/transcript')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(500)
  })
})
