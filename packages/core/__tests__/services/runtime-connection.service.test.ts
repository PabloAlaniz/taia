import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()
const mockCreateProviderAdapter = vi.fn()
const instances: Record<
  string,
  { id: string; provider: string; label: string; config: Record<string, string> }
> = {}

vi.mock('@taia/core/db', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
  getRuntimeInstance: async (id: string) => instances[id] ?? null,
}))

vi.mock('@taia/core/runtime', () => ({
  createProviderAdapter: (...args: unknown[]) => mockCreateProviderAdapter(...args),
}))

import { testRuntimeConnection } from '@taia/core/services/runtime-connection.service'

const test = (provider: string, overrides = {}, instanceId = provider) =>
  testRuntimeConnection({ provider, instanceId }, overrides)

function settings(map: Record<string, string>) {
  mockGetSetting.mockImplementation(async (key: string) => map[key] ?? null)
}

beforeEach(() => {
  vi.clearAllMocks()
  settings({})
  for (const id of Object.keys(instances)) delete instances[id]
})

describe('testRuntimeConnection', () => {
  it('merges overrides over stored settings and records success', async () => {
    instances.openclaw = { id: 'openclaw', provider: 'openclaw', label: 'openclaw', config: {} }
    settings({ 'runtime.instances.openclaw.token': 'stored' })
    const disconnect = vi.fn()
    mockCreateProviderAdapter.mockReturnValue({
      testConnection: vi.fn().mockResolvedValue({ ok: true, agents: 3 }),
      disconnect,
    })

    const result = await test('openclaw', { url: 'http://gw:4000' })

    expect(result).toEqual({ ok: true, agents: 3 })
    expect(mockCreateProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openclaw', url: 'http://gw:4000', token: 'stored' }),
    )
    expect(mockSetSetting).toHaveBeenCalledWith(
      'runtime.instances.openclaw.connection_verified',
      'true',
    )
    expect(mockSetSetting).toHaveBeenCalledWith(
      'runtime.instances.openclaw.last_verified_at',
      expect.any(String),
    )
    expect(disconnect).toHaveBeenCalled()
  })

  it('reports misconfigured without building an adapter when a requirement is missing', async () => {
    const result = await test('anthropic')

    expect(result).toMatchObject({ ok: false, reason: 'misconfigured' })
    expect(mockCreateProviderAdapter).not.toHaveBeenCalled()
    expect(mockSetSetting).not.toHaveBeenCalled()
  })

  it('refuses a CLI command outside the policy without spawning anything', async () => {
    const result = await test('claude-code', { command: 'node' })

    expect(result).toMatchObject({ ok: false, reason: 'misconfigured' })
    expect(result.error).toContain('TAIA_CLI_COMMAND_CLAUDE_CODE')
    expect(mockCreateProviderAdapter).not.toHaveBeenCalled()
  })

  it('treats standalone mode as nothing to test', async () => {
    const result = await test('none')
    expect(result).toMatchObject({ ok: false, reason: 'misconfigured' })
  })

  it('falls back to getHealth when the adapter has no testConnection', async () => {
    instances['claude-code'] = {
      id: 'claude-code',
      provider: 'claude-code',
      label: 'claude-code',
      config: {},
    }
    mockCreateProviderAdapter.mockReturnValue({
      getHealth: vi.fn().mockResolvedValue({ ok: false }),
    })

    const result = await test('claude-code', { command: 'claude' })

    expect(result).toMatchObject({ ok: false, reason: 'unreachable' })
    expect(mockSetSetting).toHaveBeenCalledWith(
      'runtime.instances.claude-code.connection_verified',
      'false',
    )
  })

  it('ignores the settings of an instance of another provider', async () => {
    instances.shared = { id: 'shared', provider: 'anthropic', label: 'shared', config: {} }
    settings({ 'runtime.instances.shared.token': 'sk-anthropic' })
    mockCreateProviderAdapter.mockReturnValue({
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
    })

    await test('openclaw', { url: 'http://gw' }, 'shared')

    expect(mockCreateProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openclaw', token: undefined }),
    )
    expect(mockSetSetting).not.toHaveBeenCalled()
  })

  it('records nothing for an instance that does not exist yet', async () => {
    mockCreateProviderAdapter.mockReturnValue({
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
    })
    await test('openclaw', { url: 'http://gw' })
    expect(mockSetSetting).not.toHaveBeenCalled()
  })
})
