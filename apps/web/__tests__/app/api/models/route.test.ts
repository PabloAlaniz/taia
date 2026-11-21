import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListRuntimeSettings = vi.fn()

vi.mock('@taia/core/services/runtime-settings.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taia/core/services/runtime-settings.service')>()),
  listRuntimeSettings: () => mockListRuntimeSettings(),
}))

// Agents run on the first instance that lists them.
vi.mock('@taia/core/runtime', () => ({
  mergeAgentListings: async (
    results: Array<{ instanceId: string; value: unknown[] }>,
    idOf: (item: unknown) => string,
  ) => {
    const merged = new Map<string, { instanceId: string; value: unknown }>()
    for (const { instanceId, value } of results) {
      for (const item of value)
        if (!merged.has(idOf(item))) merged.set(idOf(item), { instanceId, value: item })
    }
    return Array.from(merged.values())
  },
}))

import { GET } from '@/app/api/models/route'

const sonnet = { primary: 'anthropic/claude-sonnet-5-5', fallbacks: [] }
const opus = { primary: 'anthropic/claude-opus-5-5', fallbacks: [] }

const supported = (settings: unknown) => ({ provider: 'openclaw', supported: true, settings })

beforeEach(() => vi.clearAllMocks())

describe('GET /api/models', () => {
  it('lists the default model first, with the agents that use each model', async () => {
    mockListRuntimeSettings.mockResolvedValue({
      results: [
        {
          instanceId: 'gw',
          value: supported({
            defaults: { model: sonnet },
            agents: { main: {}, alex: { model: opus }, bob: { model: sonnet } },
          }),
        },
      ],
      failures: [],
    })

    const data = await (await GET()).json()

    expect(data.ok).toBe(true)
    expect(data.instances).toEqual(['gw'])
    expect(data.models).toEqual([
      {
        id: 'anthropic/claude-sonnet-5-5',
        provider: 'anthropic',
        name: 'claude-sonnet-5-5',
        isDefault: true,
        defaultFor: ['gw'],
        usedBy: ['main', 'bob'],
      },
      {
        id: 'anthropic/claude-opus-5-5',
        provider: 'anthropic',
        name: 'claude-opus-5-5',
        defaultFor: [],
        usedBy: ['alex'],
      },
    ])
  })

  it('merges the models of every instance, each agent counted once', async () => {
    mockListRuntimeSettings.mockResolvedValue({
      results: [
        {
          instanceId: 'gw',
          value: supported({ defaults: { model: sonnet }, agents: { alex: {} } }),
        },
        {
          instanceId: 'gw-b',
          value: supported({ defaults: { model: opus }, agents: { alex: {}, bea: {} } }),
        },
      ],
      failures: [],
    })

    const data = await (await GET()).json()

    expect(data.instances).toEqual(['gw', 'gw-b'])
    expect(
      data.models.map((m: { id: string; defaultFor: string[]; usedBy: string[] }) => [
        m.id,
        m.defaultFor,
        m.usedBy,
      ]),
    ).toEqual([
      ['anthropic/claude-opus-5-5', ['gw-b'], ['bea']],
      ['anthropic/claude-sonnet-5-5', ['gw'], ['alex']],
    ])
  })

  it('reports unsupported runtimes without an error', async () => {
    mockListRuntimeSettings.mockResolvedValue({
      results: [{ instanceId: 'api', value: { provider: 'anthropic', supported: false } }],
      failures: [],
    })

    const data = await (await GET()).json()

    expect(data).toEqual({ ok: true, supported: false, provider: 'anthropic', models: [] })
  })

  it('returns ok:false when no runtime answers', async () => {
    mockListRuntimeSettings.mockResolvedValue({
      results: [],
      failures: [{ instanceId: 'gw', error: 'gateway down' }],
    })

    const data = await (await GET()).json()

    expect(data).toEqual({ ok: false, error: 'gw: gateway down', models: [] })
  })
})
