import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/agents/route'

const mockFetchEnrichedAgents = vi.fn()

vi.mock('@taia/core/services/agent.service', () => ({
  fetchEnrichedAgents: (...args: any[]) => mockFetchEnrichedAgents(...args),
  createAgent: vi.fn((data: any) => ({
    agent: { ...data, enabled: 1 },
    runtimeProvisioning: { ok: true, instances: {} },
  })),
}))

describe('GET /api/agents', () => {
  it('returns all agents with status', async () => {
    mockFetchEnrichedAgents.mockResolvedValue({
      agents: [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'Developer',
          avatar: '💻',
          status: 'WORKING',
          type: 'cron',
          enabled: true,
        },
        {
          id: 'agent-5',
          name: 'Agent 5',
          role: 'Tester',
          avatar: '🔓',
          status: 'IDLE',
          type: 'cron',
          enabled: true,
        },
      ],
      source: 'openclaw-api',
    })

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agents).toHaveLength(2)
  })

  it('sets status WORKING for agents with active tasks', async () => {
    mockFetchEnrichedAgents.mockResolvedValue({
      agents: [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'Developer',
          avatar: '💻',
          status: 'WORKING',
          type: 'cron',
          enabled: true,
        },
      ],
      source: 'openclaw-api',
    })

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)
    const data = await res.json()

    const agent1 = data.agents.find((a: any) => a.id === 'agent-1')
    expect(agent1.status).toBe('WORKING')
  })

  it('returns source field from service', async () => {
    mockFetchEnrichedAgents.mockResolvedValue({
      agents: [
        {
          id: 'agent-1',
          name: 'Agent 1',
          status: 'IDLE',
          type: 'cron',
          enabled: true,
        },
      ],
      source: 'openclaw-api',
    })

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)
    const data = await res.json()

    expect(data.source).toBe('openclaw-api')
  })

  it('returns database-fallback source when OpenClaw is down', async () => {
    mockFetchEnrichedAgents.mockResolvedValue({
      agents: [
        {
          id: 'agent-1',
          name: 'Agent 1',
          status: 'IDLE',
          type: 'cron',
          enabled: true,
        },
      ],
      source: 'database-fallback',
    })

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.source).toBe('database-fallback')
  })

  it('returns 503 only when both OpenClaw and DB fail', async () => {
    mockFetchEnrichedAgents.mockRejectedValue(new Error('Everything is down'))

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data.ok).toBe(false)
    expect(data.source).toBe('error')
    expect(data.agents).toEqual([])
  })
})

describe('POST /api/agents', () => {
  it('creates agent with valid data', async () => {
    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        id: 'new-agent',
        name: 'New Agent',
        role: 'Helper',
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agent.id).toBe('new-agent')
  })

  it('returns 400 if id missing', async () => {
    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'No ID Agent' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid id format', async () => {
    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ id: 'Invalid ID!', name: 'Bad' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toContain('must match pattern')
  })
})
