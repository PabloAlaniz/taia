import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgent = vi.fn()
const mockEffective = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAgentById: (...a: unknown[]) => mockGetAgent(...a),
}))
vi.mock('@taia/core/services/agent-runtime-settings.service', () => ({
  getEffectiveAgentRuntimeSettings: (...a: unknown[]) => mockEffective(...a),
  updateAgentRuntimeSettings: (...a: unknown[]) => mockUpdate(...a),
}))

import { GET, PATCH } from '@/app/api/agents/[agentId]/runtime-settings/route'

const params = { params: Promise.resolve({ agentId: 'dev' }) }
const patch = (body: unknown) =>
  PATCH(
    new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }),
    params,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAgent.mockResolvedValue({ id: 'dev' })
})

describe('/api/agents/[agentId]/runtime-settings', () => {
  it('GET returns the effective settings and their sources', async () => {
    mockEffective.mockResolvedValue({
      agentId: 'dev',
      provider: 'openclaw',
      desired: {},
      settings: { workspace: '/w' },
      source: { workspace: 'runtime' },
    })

    const res = await GET(new NextRequest('http://localhost/x'), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, source: { workspace: 'runtime' } })
  })

  it('GET answers 404 for an unknown agent', async () => {
    mockGetAgent.mockResolvedValue(null)
    const res = await GET(new NextRequest('http://localhost/x'), params)
    expect(res.status).toBe(404)
  })

  it('PATCH stores the change and reports how the runtime took it', async () => {
    mockUpdate.mockResolvedValue({ settings: {}, runtime: { status: 'updated' } })

    const res = await patch({
      model: { primary: 'anthropic/claude-opus-5-5' },
      deniedTools: null,
    })

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith('dev', {
      model: { primary: 'anthropic/claude-opus-5-5', fallbacks: [] },
      deniedTools: null,
    })
    expect(await res.json()).toMatchObject({ ok: true, runtime: { status: 'updated' } })
  })

  it('PATCH rejects model refs without a provider and unknown fields', async () => {
    expect((await patch({ model: { primary: 'opus' } })).status).toBe(400)
    expect((await patch({ tools: ['x'] })).status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
