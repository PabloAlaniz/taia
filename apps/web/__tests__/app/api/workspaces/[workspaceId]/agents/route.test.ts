import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgentsForWorkspace = vi.fn()
const mockAddAgentToWorkspace = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAgentsForWorkspace: (...args: any[]) => mockGetAgentsForWorkspace(...args),
  addAgentToWorkspace: (...args: any[]) => mockAddAgentToWorkspace(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { GET, POST } from '@/app/api/workspaces/[workspaceId]/agents/route'

const mockParams = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId }),
})

describe('GET /api/workspaces/[workspaceId]/agents', () => {
  it('returns agents for workspace', async () => {
    const agents = [
      { id: 'agent-1', name: 'Alice', enabled: 1 },
      { id: 'agent-2', name: 'Bob', enabled: 1 },
    ]
    mockGetAgentsForWorkspace.mockResolvedValue(agents)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents')
    const res = await GET(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agents).toHaveLength(2)
    expect(mockGetAgentsForWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('returns empty array when no agents assigned', async () => {
    mockGetAgentsForWorkspace.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents')
    const res = await GET(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.agents).toEqual([])
  })
})

describe('POST /api/workspaces/[workspaceId]/agents', () => {
  it('adds agents and returns updated list', async () => {
    mockAddAgentToWorkspace.mockResolvedValue(undefined)
    const agents = [
      { id: 'agent-1', name: 'Alice', enabled: 1 },
      { id: 'agent-2', name: 'Bob', enabled: 1 },
    ]
    mockGetAgentsForWorkspace.mockResolvedValue(agents)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_ids: ['agent-1', 'agent-2'] }),
    })
    const res = await POST(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.agents).toHaveLength(2)
    expect(mockAddAgentToWorkspace).toHaveBeenCalledTimes(2)
    expect(mockAddAgentToWorkspace).toHaveBeenCalledWith('ws-1', 'agent-1')
    expect(mockAddAgentToWorkspace).toHaveBeenCalledWith('ws-1', 'agent-2')
  })

  it('returns 400 for invalid body (missing agent_ids)', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, mockParams('ws-1') as any)

    expect(res.status).toBe(400)
  })

  it('accepts empty agent_ids array (clears all agents)', async () => {
    mockGetAgentsForWorkspace.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_ids: [] }),
    })
    const res = await POST(req, mockParams('ws-1') as any)

    expect(res.status).toBe(200)
  })
})
