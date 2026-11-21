import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/agents/status/route'

vi.mock('@taia/core/db', () => ({
  getAllAgents: vi.fn(() =>
    Promise.resolve([
      {
        id: 'agent-1',
        name: 'Agent 1',
        role: 'Developer',
        avatar: '💻',
        enabled: true,
        type: 'cron',
        config: null,
      },
      {
        id: 'agent-5',
        name: 'Agent 5',
        role: 'Tester',
        avatar: '🔓',
        enabled: true,
        type: 'cron',
        config: null,
      },
    ]),
  ),
}))

vi.mock('@taia/core/agent-runtime', () => ({
  getAgentSessions: vi.fn((agentId: string) => {
    if (agentId === 'agent-1') {
      return [
        {
          key: 'session-1',
          sessionId: 'sess-abc',
          updatedAt: Date.now() - 60000, // 1 min ago = live
          model: 'claude-3',
          totalTokens: 1000,
        },
      ]
    }
    if (agentId === 'agent-5') {
      return [
        {
          key: 'session-2',
          sessionId: 'sess-def',
          updatedAt: Date.now() - 600000, // 10 min ago = idle
        },
      ]
    }
    return []
  }),
  getNextHeartbeat: vi.fn((_agentId: string, _cronExpr?: string) => ({
    nextRunAtMs: Date.now() + 300000,
    nextRunIn: '5m',
  })),
}))

describe('GET /api/agents/status', () => {
  it('returns status for all DB agents', async () => {
    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agents).toBeDefined()
    expect(data.agents.length).toBe(2)
  })

  it('includes agent metadata (name, role, avatar)', async () => {
    const res = await GET()
    const data = await res.json()

    const agent1 = data.agents.find((a: any) => a.id === 'agent-1')
    expect(agent1).toBeDefined()
    expect(agent1.name).toBe('Agent 1')
    expect(agent1.role).toBe('Developer')
    expect(agent1.avatar).toBe('💻')
  })

  it('determines live status from recent activity', async () => {
    const res = await GET()
    const data = await res.json()

    const agent1 = data.agents.find((a: any) => a.id === 'agent-1')
    expect(agent1.status).toBe('live')
  })

  it('determines idle status from older activity', async () => {
    const res = await GET()
    const data = await res.json()

    const agent5 = data.agents.find((a: any) => a.id === 'agent-5')
    expect(agent5.status).toBe('idle')
  })

  it('includes next heartbeat info', async () => {
    const res = await GET()
    const data = await res.json()

    const agent1 = data.agents.find((a: any) => a.id === 'agent-1')
    expect(agent1.nextRunIn).toBe('5m')
  })

  it('includes timestamp in response', async () => {
    const res = await GET()
    const data = await res.json()

    expect(data.timestamp).toBeDefined()
    expect(typeof data.timestamp).toBe('number')
  })
})
