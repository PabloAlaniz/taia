import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAdapter = vi.fn()
const mockInstanceAdapter = vi.fn()

vi.mock('@taia/core/runtime', () => ({
  getDefaultRuntimeAdapter: () => mockAdapter(),
  getRuntimeAdapter: (id: string) => mockInstanceAdapter(id),
}))

import { GET, PATCH } from '@/app/api/gateway/config/route'

const nativeAdapter = (overrides: Record<string, unknown> = {}) => ({
  id: 'openclaw',
  capabilities: { has: (c: string) => c === 'native_config' },
  getNativeConfig: vi
    .fn()
    .mockResolvedValue({ document: { agents: { entries: {} } }, revision: 'h1' }),
  patchNativeConfig: vi.fn().mockResolvedValue({ ok: true }),
  ...overrides,
})

const get = (query = '') => GET(new NextRequest(`http://localhost/x${query}`))
const patch = (body: unknown, query = '') =>
  PATCH(
    new NextRequest(`http://localhost/x${query}`, { method: 'PATCH', body: JSON.stringify(body) }),
  )

beforeEach(() => vi.clearAllMocks())

describe('/api/gateway/config', () => {
  it('GET returns the native document and its revision', async () => {
    mockAdapter.mockResolvedValue(nativeAdapter())
    expect(await (await get()).json()).toEqual({
      ok: true,
      config: { agents: { entries: {} } },
      hash: 'h1',
    })
  })

  it('GET reads the instance named in ?instance=', async () => {
    mockInstanceAdapter.mockResolvedValue(nativeAdapter())

    expect((await (await get('?instance=gw-b')).json()).hash).toBe('h1')
    expect(mockInstanceAdapter).toHaveBeenCalledWith('gw-b')
    expect(mockAdapter).not.toHaveBeenCalled()
  })

  it('GET reports runtimes without a native config', async () => {
    mockAdapter.mockResolvedValue({ id: 'anthropic', capabilities: { has: () => false } })
    expect((await (await get()).json()).ok).toBe(false)
  })

  it('PATCH forwards the patch as-is with the revision precondition', async () => {
    const adapter = nativeAdapter()
    mockAdapter.mockResolvedValue(adapter)
    const res = await patch({
      patch: { agents: { defaults: { maxConcurrent: 4 } } },
      baseHash: 'h1',
    })
    expect(res.status).toBe(200)
    expect(adapter.patchNativeConfig).toHaveBeenCalledWith(
      { agents: { defaults: { maxConcurrent: 4 } } },
      'h1',
    )
  })

  it('PATCH rejects a missing patch', async () => {
    expect((await patch({})).status).toBe(400)
  })
})
