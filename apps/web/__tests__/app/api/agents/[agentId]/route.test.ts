import { describe, it, expect, vi } from 'vitest'
import { GET, PUT, DELETE } from '@/app/api/agents/[agentId]/route'

vi.mock('@taia/core/services/activity.service', () => ({
  logAgentUpdated: vi.fn(),
}))

vi.mock('@taia/core/db', () => ({
  getAgentById: vi.fn((id: string) => {
    if (id === 'agent-1') {
      return { id: 'agent-1', name: 'Agent 1', role: 'Developer', enabled: 1 }
    }
    return null
  }),
  updateAgent: vi.fn((id: string, updates: any) => {
    if (id === 'agent-1') {
      return { id: 'agent-1', ...updates }
    }
    return null
  }),
}))

vi.mock('@taia/core/services/agent.service', () => ({
  removeAgent: vi.fn((id: string) =>
    id === 'agent-1'
      ? { runtimeDeprovisioning: { instanceId: 'openclaw', status: 'removed' } }
      : null,
  ),
}))

const mockParams = (agentId: string) => ({ params: { agentId } })

describe('GET /api/agents/[agentId]', () => {
  it('returns agent when found', async () => {
    const req = new Request('http://localhost/api/agents/agent-1')
    const res = await GET(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agent.id).toBe('agent-1')
  })

  it('returns 404 when agent not found', async () => {
    const req = new Request('http://localhost/api/agents/unknown')
    const res = await GET(req, mockParams('unknown'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/agents/[agentId]', () => {
  it('updates agent when found', async () => {
    const req = new Request('http://localhost/api/agents/agent-1', {
      method: 'PUT',
      body: JSON.stringify({ role: 'Senior Developer', enabled: false }),
    })

    const res = await PUT(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('returns 404 when agent not found', async () => {
    const req = new Request('http://localhost/api/agents/unknown', {
      method: 'PUT',
      body: JSON.stringify({ role: 'Test' }),
    })

    const res = await PUT(req, mockParams('unknown'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/agents/[agentId]', () => {
  it('deletes agent when found', async () => {
    const req = new Request('http://localhost/api/agents/agent-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('agent-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.runtimeDeprovisioning).toEqual({
      instanceId: 'openclaw',
      status: 'removed',
    })
  })

  it('returns 404 when agent not found', async () => {
    const req = new Request('http://localhost/api/agents/unknown', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('unknown'))

    expect(res.status).toBe(404)
  })
})
