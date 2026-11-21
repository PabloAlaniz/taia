import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSync = vi.fn()
const mockStatus = vi.fn()

vi.mock('@taia/core/services/context-sync.service', () => ({
  syncAgentContext: (...a: unknown[]) => mockSync(...a),
  getAgentContextSyncStatus: (...a: unknown[]) => mockStatus(...a),
}))

import { GET, POST } from '@/app/api/agents/[agentId]/context/sync/route'

const params = { params: Promise.resolve({ agentId: 'alex' }) }
const post = (body?: unknown) =>
  POST(
    new NextRequest('http://localhost/x', {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    params,
  )

beforeEach(() => vi.clearAllMocks())

describe('/api/agents/[agentId]/context/sync', () => {
  it('GET returns the ledger row', async () => {
    mockStatus.mockResolvedValue({ status: 'pushed' })
    const data = await (await GET(new NextRequest('http://localhost/x'), params)).json()
    expect(data).toEqual({ agentId: 'alex', sync: { status: 'pushed' } })
  })

  it('POST pushes, forwarding force', async () => {
    mockSync.mockResolvedValue({ status: 'pushed', state: {}, changedPaths: ['SOUL.md'] })
    const res = await post({ force: true })
    expect(res.status).toBe(200)
    expect(mockSync).toHaveBeenCalledWith('alex', { force: true })
  })

  it('POST answers 409 on conflict', async () => {
    mockSync.mockResolvedValue({ status: 'conflict', state: {}, conflicts: [] })
    expect((await post()).status).toBe(409)
    expect(mockSync).toHaveBeenCalledWith('alex', { force: false })
  })

  it('POST reports when there is nothing to sync', async () => {
    mockSync.mockResolvedValue(null)
    expect((await (await post()).json()).status).toBe('not_applicable')
  })

  it('POST answers 502 when the runtime fails', async () => {
    mockSync.mockRejectedValue(new Error('gateway down'))
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).details).toBe('gateway down')
  })
})
