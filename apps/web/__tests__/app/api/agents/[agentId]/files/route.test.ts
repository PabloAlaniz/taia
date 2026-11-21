import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockListAgentMemories = vi.fn()
const mockGetAgentWorkingState = vi.fn()
const mockUpsertAgentWorkingState = vi.fn()
const mockLoadBundle = vi.fn()
const mockProject = vi.fn()
const adapter = {
  capabilities: { has: (c: string) => c === 'context_sync' },
  projectAgentContext: (...args: unknown[]) => mockProject(...args),
}

vi.mock('@taia/core/db', () => ({
  listAgentMemories: (...args: unknown[]) => mockListAgentMemories(...args),
  getAgentWorkingState: (...args: unknown[]) => mockGetAgentWorkingState(...args),
  upsertAgentWorkingState: (...args: unknown[]) => mockUpsertAgentWorkingState(...args),
}))
vi.mock('@taia/core/runtime', () => ({
  getRuntimeAdapterForAgent: vi.fn(async () => adapter),
}))
vi.mock('@taia/core/services/context.service', () => ({
  loadAgentContextBundle: (...args: unknown[]) => mockLoadBundle(...args),
}))

import { GET, PUT } from '@/app/api/agents/[agentId]/files/route'

beforeEach(() => {
  vi.clearAllMocks()
  mockListAgentMemories.mockResolvedValue([])
  mockGetAgentWorkingState.mockResolvedValue(null)
  mockLoadBundle.mockResolvedValue(null)
})

const makeParams = (agentId: string) => ({ params: Promise.resolve({ agentId }) })

function put(filename: string, content: string) {
  return PUT(
    new NextRequest('http://localhost/api/agents/agent-1/files', {
      method: 'PUT',
      body: JSON.stringify({ filename, content }),
      headers: { 'Content-Type': 'application/json' },
    }),
    makeParams('agent-1'),
  )
}

describe('GET /api/agents/[agentId]/files', () => {
  it('renders the files from the bundle through the runtime adapter', async () => {
    const bundle = { agent: { id: 'agent-1' } }
    mockLoadBundle.mockResolvedValue(bundle)
    mockProject.mockReturnValue({
      files: [
        { path: 'SOUL.md', content: '# Soul\n', sha256: 'a' },
        { path: 'AGENTS.md', content: '# Agents\n', sha256: 'b' },
      ],
    })
    mockGetAgentWorkingState.mockResolvedValue({ content: '# Working' })
    mockListAgentMemories.mockResolvedValue([
      { path: '/memories/notes.md' },
      { path: '/memories/patterns.md' },
    ])

    const res = await GET(new NextRequest('http://localhost/x'), makeParams('agent-1'))
    const data = await res.json()

    expect(mockProject).toHaveBeenCalledWith(bundle)
    expect(data.files).toEqual({
      'SOUL.md': '# Soul\n',
      'AGENTS.md': '# Agents\n',
      'WORKING.md': '# Working',
    })
    expect(data.memoryFiles).toEqual(['notes.md', 'patterns.md'])
    expect(mockListAgentMemories).toHaveBeenCalledWith('agent-1', { pathPrefix: '/memories/' })
  })

  it('returns only WORKING.md for an agent without a typed identity', async () => {
    const data = await (await GET(new NextRequest('http://localhost/x'), makeParams('bob'))).json()

    expect(mockProject).not.toHaveBeenCalled()
    expect(data.files).toEqual({ 'WORKING.md': '' })
  })
})

describe('PUT /api/agents/[agentId]/files', () => {
  it('stores WORKING.md as the agent working state', async () => {
    const res = await put('WORKING.md', 'progress')

    expect(res.status).toBe(200)
    expect(mockUpsertAgentWorkingState).toHaveBeenCalledWith('agent-1', 'progress', {
      updatedBy: 'ui:files',
    })
  })

  it.each(['SOUL.md', 'HEARTBEAT.md', 'AGENTS.md'])(
    'refuses %s with 409: it is rendered from the identity',
    async (filename) => {
      const res = await put(filename, '# edited')

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain('/api/agents/agent-1/context')
      expect(mockUpsertAgentWorkingState).not.toHaveBeenCalled()
    },
  )

  it('returns 400 for other file names', async () => {
    const res = await put('SECRET.md', 'hack')

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('not allowed')
  })

  it('returns 500 when the write fails', async () => {
    mockUpsertAgentWorkingState.mockRejectedValue(new Error('DB error'))

    expect((await put('WORKING.md', 'test')).status).toBe(500)
  })
})
