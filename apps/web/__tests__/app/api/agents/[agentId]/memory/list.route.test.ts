import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockListAgentMemories = vi.fn()

vi.mock('@taia/core/db', () => ({
  listAgentMemories: (...args: unknown[]) => mockListAgentMemories(...args),
}))

import { GET } from '@/app/api/agents/[agentId]/memory/route'

describe('GET /api/agents/[agentId]/memory', () => {
  it('lists memory file names under /memories/', async () => {
    mockListAgentMemories.mockResolvedValue([
      { path: '/memories/notes.md' },
      { path: '/memories/prefs.md' },
    ])

    const res = await GET(new NextRequest('http://localhost/x'), {
      params: Promise.resolve({ agentId: 'alex' }),
    })

    expect(await res.json()).toEqual({ agentId: 'alex', files: ['notes.md', 'prefs.md'] })
    expect(mockListAgentMemories).toHaveBeenCalledWith('alex', { pathPrefix: '/memories/' })
  })
})
