import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTestProviderConnection = vi.fn()
const mockGetActiveRuntimeProvider = vi.fn()

vi.mock('@taia/core/services/runtime-connection.service', () => ({
  testRuntimeConnection: (...args: unknown[]) => mockTestProviderConnection(...args),
}))

vi.mock('@taia/core/runtime-instances', () => ({
  getDefaultInstanceConfig: async () => ({ provider: await mockGetActiveRuntimeProvider() }),
}))

import { POST } from '@/app/api/settings/test-connection/route'
import { POST as POST_ANTHROPIC } from '@/app/api/settings/test-connection/anthropic/route'

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetActiveRuntimeProvider.mockResolvedValue('openclaw')
})

describe('POST /api/settings/test-connection', () => {
  it('tests the requested provider with the unsaved overrides', async () => {
    mockTestProviderConnection.mockResolvedValue({ ok: true, agents: 2 })

    const res = await POST(
      request('/api/settings/test-connection', {
        provider: 'openclaw',
        url: 'http://localhost:4000',
        token: 'tok',
      }),
    )
    const data = await res.json()

    expect(mockTestProviderConnection).toHaveBeenCalledWith(
      { provider: 'openclaw', instanceId: 'openclaw' },
      {
        url: 'http://localhost:4000',
        token: 'tok',
        model: undefined,
        command: undefined,
        cwd: undefined,
      },
    )
    expect(data).toMatchObject({ ok: true, provider: 'openclaw', agents_found: 2 })
  })

  it("defaults to the default instance's provider and ignores masked secrets", async () => {
    mockGetActiveRuntimeProvider.mockResolvedValue('anthropic')
    mockTestProviderConnection.mockResolvedValue({
      ok: true,
      details: { model: 'claude-opus-5-5' },
    })

    const res = await POST(request('/api/settings/test-connection', { apiKey: '********' }))
    const data = await res.json()

    expect(mockTestProviderConnection).toHaveBeenCalledWith(
      { provider: 'anthropic', instanceId: 'anthropic' },
      expect.objectContaining({ token: undefined }),
    )
    expect(data).toMatchObject({ ok: true, provider: 'anthropic', model: 'claude-opus-5-5' })
  })

  it('returns the failure reason with a hint', async () => {
    mockTestProviderConnection.mockResolvedValue({
      ok: false,
      reason: 'unauthorized',
      error: 'HTTP 401: Unauthorized',
    })

    const res = await POST(request('/api/settings/test-connection', { provider: 'openclaw' }))
    const data = await res.json()

    expect(data).toMatchObject({
      ok: false,
      reason: 'unauthorized',
      error: 'HTTP 401: Unauthorized',
    })
    expect(data.hint).toContain('Credenciales')
  })

  it('tells the operator which pairing request to approve', async () => {
    mockTestProviderConnection.mockResolvedValue({
      ok: false,
      reason: 'pairing_required',
      error: 'device pairing required',
      details: { requestId: 'req-42' },
    })

    const data = await (
      await POST(request('/api/settings/test-connection', { provider: 'openclaw' }))
    ).json()

    expect(data.reason).toBe('pairing_required')
    expect(data.hint).toContain('openclaw devices approve req-42')
  })

  it('names the missing model when the provider reports not_found', async () => {
    mockTestProviderConnection.mockResolvedValue({
      ok: false,
      reason: 'not_found',
      error: '404',
      details: { model: 'claude-nope' },
    })

    const res = await POST(request('/api/settings/test-connection', { provider: 'anthropic' }))
    const data = await res.json()

    expect(data.hint).toContain('claude-nope')
  })
})

describe('POST /api/settings/test-connection/anthropic', () => {
  it('always targets the anthropic provider', async () => {
    mockTestProviderConnection.mockResolvedValue({ ok: true })

    await POST_ANTHROPIC(
      request('/api/settings/test-connection/anthropic', { apiKey: 'sk-x', model: 'm' }),
    )

    expect(mockTestProviderConnection).toHaveBeenCalledWith(
      { provider: 'anthropic', instanceId: 'anthropic' },
      expect.objectContaining({ token: 'sk-x', model: 'm' }),
    )
    expect(mockGetActiveRuntimeProvider).not.toHaveBeenCalled()
  })
})
