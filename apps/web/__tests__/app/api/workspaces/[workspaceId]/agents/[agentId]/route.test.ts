import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockRemoveAgentFromWorkspace = vi.fn()

vi.mock('@taia/core/db', () => ({
  removeAgentFromWorkspace: (...args: any[]) => mockRemoveAgentFromWorkspace(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { DELETE } from '@/app/api/workspaces/[workspaceId]/agents/[agentId]/route'

const mockParams = (workspaceId: string, agentId: string) => ({
  params: Promise.resolve({ workspaceId, agentId }),
})

describe('DELETE /api/workspaces/[workspaceId]/agents/[agentId]', () => {
  it('removes agent from workspace', async () => {
    mockRemoveAgentFromWorkspace.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents/agent-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('ws-1', 'agent-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.deleted).toBe(true)
    expect(mockRemoveAgentFromWorkspace).toHaveBeenCalledWith('ws-1', 'agent-1')
  })

  it('returns 200 even when record did not exist (idempotent)', async () => {
    mockRemoveAgentFromWorkspace.mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/agents/nonexistent', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('ws-1', 'nonexistent') as any)
    const data = await res.json()

    // The route always returns apiOk({ deleted: true }) regardless of removeAgentFromWorkspace result
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })
})
