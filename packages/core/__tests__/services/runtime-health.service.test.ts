import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConfigured = vi.fn()
const mockDefaultConfig = vi.fn()
const states: Record<string, string | Error> = {}

vi.mock('@taia/core/runtime-instances', () => ({
  listConfiguredInstances: () => mockListConfigured(),
  getDefaultInstanceConfig: () => mockDefaultConfig(),
}))

vi.mock('@taia/core/runtime', () => ({
  forEachRuntime: async (fn: (adapter: unknown, id: string) => Promise<string>) => {
    const fanOut = { results: [] as unknown[], failures: [] as unknown[] }
    for (const [instanceId, state] of Object.entries(states)) {
      if (state instanceof Error) fanOut.failures.push({ instanceId, error: state.message })
      else
        fanOut.results.push({
          instanceId,
          value: await fn({ getConnectionState: () => state }, instanceId),
        })
    }
    return fanOut
  },
}))

import { getRuntimeHealth } from '@taia/core/services/runtime-health.service'

const instance = (instanceId: string, provider: string, url: string | null = null) => ({
  instanceId,
  provider,
  label: instanceId,
  url,
  configured: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(states)) delete states[key]
  mockDefaultConfig.mockResolvedValue({ instanceId: 'gw', provider: 'openclaw' })
})

describe('getRuntimeHealth', () => {
  it('reports standalone mode when no instance is configured', async () => {
    mockListConfigured.mockResolvedValue([])
    mockDefaultConfig.mockResolvedValue({ instanceId: null, provider: 'none' })

    expect(await getRuntimeHealth()).toEqual({
      ok: false,
      state: 'disconnected',
      configured: false,
      provider: 'none',
      instances: [],
    })
  })

  it('reports each instance and connected when all of them are', async () => {
    mockListConfigured.mockResolvedValue([
      instance('gw', 'openclaw', 'ws://gw:18789'),
      instance('api', 'anthropic'),
    ])
    states.gw = 'connected'
    states.api = 'connected'

    expect(await getRuntimeHealth()).toEqual({
      ok: true,
      state: 'connected',
      configured: true,
      provider: 'openclaw',
      instances: [
        {
          instanceId: 'gw',
          provider: 'openclaw',
          label: 'gw',
          isDefault: true,
          state: 'connected',
          url: 'ws://gw:18789',
        },
        {
          instanceId: 'api',
          provider: 'anthropic',
          label: 'api',
          isDefault: false,
          state: 'connected',
        },
      ],
    })
  })

  it('is degraded when only some instances are connected', async () => {
    mockListConfigured.mockResolvedValue([instance('gw', 'openclaw'), instance('api', 'anthropic')])
    states.gw = 'connected'
    states.api = new Error('no answer after 10000ms')

    const health = await getRuntimeHealth()

    expect(health).toMatchObject({ ok: false, state: 'degraded' })
    expect(health.instances.map((i) => i.state)).toEqual(['connected', 'disconnected'])
  })

  it('is connecting while no instance is connected and one is on its way', async () => {
    mockListConfigured.mockResolvedValue([instance('gw', 'openclaw'), instance('api', 'anthropic')])
    states.gw = 'reconnecting'
    states.api = 'disconnected'

    expect((await getRuntimeHealth()).state).toBe('connecting')
  })
})
