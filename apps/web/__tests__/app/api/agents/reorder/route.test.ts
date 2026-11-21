import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockReorderAgents = vi.fn()

vi.mock('@taia/core/db', () => ({
  reorderAgents: (...args: any[]) => mockReorderAgents(...args),
}))

import { POST } from '@/app/api/agents/reorder/route'

beforeEach(() => vi.clearAllMocks())

describe('POST /api/agents/reorder', () => {
  it('reorders agents successfully', async () => {
    mockReorderAgents.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/agents/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: ['agent-1', 'bob', 'charlie'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockReorderAgents).toHaveBeenCalledWith(['agent-1', 'bob', 'charlie'])
  })

  it('returns 400 when orderedIds is not an array', async () => {
    const req = new NextRequest('http://localhost/api/agents/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: 'not-an-array' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('handles DB errors', async () => {
    mockReorderAgents.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/agents/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: ['a'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
