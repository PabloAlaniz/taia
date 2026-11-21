import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgentMemory = vi.fn()
const mockUpsertAgentMemory = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAgentMemory: (...args: any[]) => mockGetAgentMemory(...args),
  upsertAgentMemory: (...args: any[]) => mockUpsertAgentMemory(...args),
}))

import { GET, PUT } from '@/app/api/agents/[agentId]/memory/[filename]/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (agentId: string, filename: string) => ({
  params: { agentId, filename },
})

describe('GET /api/agents/[agentId]/memory/[filename]', () => {
  it('returns memory file content', async () => {
    mockGetAgentMemory.mockResolvedValue({ content: '# My Notes\nSome content' })

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/notes.md')
    const res = await GET(req, makeParams('agent-1', 'notes.md'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.agentId).toBe('agent-1')
    expect(data.filename).toBe('notes.md')
    expect(data.content).toBe('# My Notes\nSome content')
    expect(mockGetAgentMemory).toHaveBeenCalledWith('agent-1', '/memories/notes.md')
  })

  it('returns 404 when file not found', async () => {
    mockGetAgentMemory.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/missing.md')
    const res = await GET(req, makeParams('agent-1', 'missing.md'))

    expect(res.status).toBe(404)
  })

  it('returns 400 for non-.md filename', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/script.js')
    const res = await GET(req, makeParams('agent-1', 'script.js'))

    expect(res.status).toBe(400)
  })

  it('returns 400 for path traversal attempt', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/..%2Fsecret.md')
    const res = await GET(req, makeParams('agent-1', '../secret.md'))

    expect(res.status).toBe(400)
  })

  it('rejects lowercase memory.md (deprecated by OpenClaw v2026.4.10+)', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/memory.md')
    const res = await GET(req, makeParams('agent-1', 'memory.md'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/MEMORY\.md/)
    expect(mockGetAgentMemory).not.toHaveBeenCalled()
  })

  it('accepts uppercase MEMORY.md', async () => {
    mockGetAgentMemory.mockResolvedValue({ content: '# Agent memory' })

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/MEMORY.md')
    const res = await GET(req, makeParams('agent-1', 'MEMORY.md'))

    expect(res.status).toBe(200)
    expect(mockGetAgentMemory).toHaveBeenCalledWith('agent-1', '/memories/MEMORY.md')
  })
})

describe('PUT /api/agents/[agentId]/memory/[filename]', () => {
  it('writes memory file content', async () => {
    mockUpsertAgentMemory.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/notes.md', {
      method: 'PUT',
      body: JSON.stringify({ content: '# Updated notes' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('agent-1', 'notes.md'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpsertAgentMemory).toHaveBeenCalledWith(
      'agent-1',
      '/memories/notes.md',
      '# Updated notes',
    )
  })

  it('returns 400 when content is not a string', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/notes.md', {
      method: 'PUT',
      body: JSON.stringify({ content: 123 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('agent-1', 'notes.md'))

    expect(res.status).toBe(400)
  })

  it('rejects writes to lowercase memory.md', async () => {
    const req = new NextRequest('http://localhost/api/agents/agent-1/memory/memory.md', {
      method: 'PUT',
      body: JSON.stringify({ content: '# notes' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('agent-1', 'memory.md'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/MEMORY\.md/)
    expect(mockUpsertAgentMemory).not.toHaveBeenCalled()
  })
})
