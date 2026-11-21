import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetInstanceAdapterConfig = vi.fn()
const mockGetDefaultInstanceId = vi.fn()
const mockGetAgentInstanceId = vi.fn()
const mockListConfiguredInstances = vi.fn()
const mockLoadAgentInstanceResolver = vi.fn()
const mockCreateRuntimeAdapter = vi.fn()

vi.mock('@taia/core/runtime-instances', () => ({
  getInstanceAdapterConfig: (...args: unknown[]) => mockGetInstanceAdapterConfig(...args),
  getDefaultInstanceId: () => mockGetDefaultInstanceId(),
  getAgentInstanceId: (...args: unknown[]) => mockGetAgentInstanceId(...args),
  listConfiguredInstances: () => mockListConfiguredInstances(),
  loadAgentInstanceResolver: () => mockLoadAgentInstanceResolver(),
}))

vi.mock('@taia/runtime/adapters/openclaw', () => ({}))
vi.mock('@taia/runtime/adapters/noop', () => ({}))
vi.mock('@taia/runtime/adapters/claude-code', () => ({}))
vi.mock('@taia/runtime/adapters/cursor', () => ({}))
vi.mock('@taia/runtime/adapters/aider', () => ({}))
vi.mock('@taia/core/anthropic-wiring', () => ({}))
vi.mock('@taia/core/openclaw-wiring', () => ({}))

vi.mock('@taia/runtime', () => ({
  createRuntimeAdapter: (...args: unknown[]) => mockCreateRuntimeAdapter(...args),
}))

import {
  disposeRuntimeAdapter,
  forEachRuntime,
  getDefaultRuntimeAdapter,
  getRuntimeAdapter,
  getRuntimeAdapterForAgent,
  mergeAgentListings,
  peekRuntimeAdapter,
} from '@taia/core/runtime'

type FakeAdapter = { id: string; instanceId?: string; disconnect: ReturnType<typeof vi.fn> }

const configs: Record<string, Record<string, unknown> | null> = {}

beforeEach(() => {
  vi.clearAllMocks()
  disposeRuntimeAdapter()
  for (const key of Object.keys(configs)) delete configs[key]
  configs['gw-a'] = { provider: 'openclaw', instanceId: 'gw-a', url: 'http://a:18789', token: '' }
  configs['gw-b'] = { provider: 'openclaw', instanceId: 'gw-b', url: 'http://b:18789', token: '' }
  mockGetInstanceAdapterConfig.mockImplementation(async (id: string) => configs[id] ?? null)
  mockGetDefaultInstanceId.mockResolvedValue('gw-a')
  mockGetAgentInstanceId.mockResolvedValue('gw-a')
  mockCreateRuntimeAdapter.mockImplementation(
    (config: { provider: string; instanceId?: string }): FakeAdapter =>
      ({
        id: config.provider,
        instanceId: config.instanceId,
        isAvailable: vi.fn().mockResolvedValue(true),
        disconnect: vi.fn(),
      }) as FakeAdapter,
  )
})

describe('runtime adapter pool', () => {
  it('keeps one adapter per instance while its config is unchanged', async () => {
    const a1 = await getRuntimeAdapter('gw-a')
    const a2 = await getRuntimeAdapter('gw-a')
    const b = await getRuntimeAdapter('gw-b')

    expect(a2).toBe(a1)
    expect(b).not.toBe(a1)
    expect(mockCreateRuntimeAdapter).toHaveBeenCalledTimes(2)
    expect(mockCreateRuntimeAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'gw-b', url: 'http://b:18789' }),
    )
  })

  it('rebuilds only the instance whose config changed', async () => {
    const a1 = (await getRuntimeAdapter('gw-a')) as unknown as FakeAdapter
    const b1 = await getRuntimeAdapter('gw-b')
    configs['gw-a'] = { ...configs['gw-a'], url: 'http://a2:18789' }

    const a2 = await getRuntimeAdapter('gw-a')
    expect(a2).not.toBe(a1)
    expect(a1.disconnect).toHaveBeenCalledTimes(1)
    expect(await getRuntimeAdapter('gw-b')).toBe(b1)
  })

  it('gives an unconfigured or unknown instance the noop adapter', async () => {
    const adapter = await getRuntimeAdapter('missing')
    expect(adapter.id).toBe('none')
  })

  it('resolves the default instance, and standalone mode without one', async () => {
    expect((await getDefaultRuntimeAdapter()) as unknown).toMatchObject({ instanceId: 'gw-a' })

    mockGetDefaultInstanceId.mockResolvedValue(null)
    expect((await getDefaultRuntimeAdapter()).id).toBe('none')
  })

  it('runs each agent on its instance', async () => {
    mockGetAgentInstanceId.mockResolvedValue('gw-b')
    expect((await getRuntimeAdapterForAgent('alex')) as unknown).toMatchObject({
      instanceId: 'gw-b',
    })
    expect(mockGetAgentInstanceId).toHaveBeenCalledWith('alex')
  })

  it('disposes one instance or all of them', async () => {
    const a = (await getRuntimeAdapter('gw-a')) as unknown as FakeAdapter
    const b = (await getRuntimeAdapter('gw-b')) as unknown as FakeAdapter

    disposeRuntimeAdapter('gw-a')
    expect(a.disconnect).toHaveBeenCalled()
    expect(peekRuntimeAdapter('gw-a')).toBeNull()
    expect(peekRuntimeAdapter('gw-b')).toBe(b)

    disposeRuntimeAdapter()
    expect(b.disconnect).toHaveBeenCalled()
    expect(peekRuntimeAdapter('gw-b')).toBeNull()
  })
})

describe('forEachRuntime', () => {
  beforeEach(() => {
    mockListConfiguredInstances.mockResolvedValue([{ instanceId: 'gw-a' }, { instanceId: 'gw-b' }])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('runs on every configured instance, in order', async () => {
    const fanOut = await forEachRuntime(async (adapter, instanceId) => {
      expect((adapter as unknown as FakeAdapter).instanceId).toBe(instanceId)
      return instanceId.toUpperCase()
    })

    expect(fanOut).toEqual({
      results: [
        { instanceId: 'gw-a', value: 'GW-A' },
        { instanceId: 'gw-b', value: 'GW-B' },
      ],
      failures: [],
    })
  })

  it('reports an instance that throws without dropping the others', async () => {
    const fanOut = await forEachRuntime(async (_adapter, instanceId) => {
      if (instanceId === 'gw-a') throw new Error('gateway down')
      return 'ok'
    })

    expect(fanOut.results).toEqual([{ instanceId: 'gw-b', value: 'ok' }])
    expect(fanOut.failures).toEqual([{ instanceId: 'gw-a', error: 'gateway down' }])
  })

  it('gives up on an instance that does not answer in time', async () => {
    const fanOut = await forEachRuntime(
      (_adapter, instanceId) =>
        instanceId === 'gw-a' ? new Promise<string>(() => {}) : Promise.resolve('ok'),
      { timeoutMs: 20 },
    )

    expect(fanOut.results).toEqual([{ instanceId: 'gw-b', value: 'ok' }])
    expect(fanOut.failures).toEqual([{ instanceId: 'gw-a', error: 'no answer after 20ms' }])
  })

  it('does nothing in standalone mode', async () => {
    mockListConfiguredInstances.mockResolvedValue([])
    const fn = vi.fn()

    expect(await forEachRuntime(fn)).toEqual({ results: [], failures: [] })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('mergeAgentListings', () => {
  it('keeps one entry per agent, from the instance it runs on', async () => {
    mockLoadAgentInstanceResolver.mockResolvedValue((agentId: string) =>
      agentId === 'shared' ? 'gw-b' : 'gw-a',
    )

    const merged = await mergeAgentListings(
      [
        { instanceId: 'gw-a', value: [{ id: 'alex' }, { id: 'shared', from: 'a' }] },
        { instanceId: 'gw-b', value: [{ id: 'shared', from: 'b' }, { id: 'bea' }] },
      ],
      (agent) => agent.id,
    )

    expect(merged).toEqual([
      { instanceId: 'gw-a', value: { id: 'alex' } },
      { instanceId: 'gw-b', value: { id: 'shared', from: 'b' } },
      { instanceId: 'gw-b', value: { id: 'bea' } },
    ])
  })

  it('takes an agent no instance owns from the first that reports it', async () => {
    mockLoadAgentInstanceResolver.mockResolvedValue(() => 'gw-c')

    const merged = await mergeAgentListings(
      [
        { instanceId: 'gw-a', value: [{ id: 'x', from: 'a' }] },
        { instanceId: 'gw-b', value: [{ id: 'x', from: 'b' }] },
      ],
      (agent) => agent.id,
    )

    expect(merged).toEqual([{ instanceId: 'gw-a', value: { id: 'x', from: 'a' } }])
  })
})
