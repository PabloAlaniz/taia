import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory settings table and runtime_instances table.
const settings = new Map<string, string>()
const instances = new Map<
  string,
  { id: string; provider: string; label: string; config: Record<string, string> }
>()
const assignments = new Map<string, string>()

vi.mock('@taia/core/db', () => ({
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => {
    settings.set(key, value)
  },
  deleteSetting: async (key: string) => settings.delete(key),
  getRuntimeInstance: async (id: string) => instances.get(id) ?? null,
  listRuntimeInstances: async () => [...instances.values()],
  getAgentRuntimeInstanceId: async (agentId: string) => assignments.get(agentId) ?? null,
  upsertRuntimeInstance: async (input: {
    id: string
    provider: string
    label: string
    config: Record<string, string | null>
  }) => {
    const row = instances.get(input.id) ?? { ...input, config: {} }
    for (const [k, v] of Object.entries(input.config)) {
      if (v === null) delete row.config[k]
      else row.config[k] = v
    }
    instances.set(input.id, row)
    return row
  },
}))

import {
  applyProviderSetting,
  getAgentInstanceId,
  getDefaultInstanceConfig,
  getInstanceAdapterConfig,
  getInstanceConfig,
  listConfiguredInstances,
} from '@taia/core/runtime-instances'

function instance(id: string, provider: string, config: Record<string, string> = {}) {
  instances.set(id, { id, provider, label: id, config })
}

beforeEach(() => {
  settings.clear()
  instances.clear()
  assignments.clear()
})

describe('runtime instances', () => {
  it('treats a CLI instance with a command outside the policy as unconfigured', async () => {
    instance('claude-code', 'claude-code', { enabled: 'true', command: 'node' })
    settings.set('runtime.default_instance', 'claude-code')

    expect(await getDefaultInstanceConfig()).toMatchObject({ command: null, configured: false })
    expect(await getInstanceAdapterConfig('claude-code')).toBeNull()
  })

  it('reads a CLI instance once it is enabled', async () => {
    instance('cursor', 'cursor', {
      enabled: 'true',
      command: 'cursor-agent',
      cwd: '/tmp/cursor-ws',
      promptMode: 'stdin',
    })
    settings.set('runtime.default_instance', 'cursor')

    expect(await getDefaultInstanceConfig()).toMatchObject({
      instanceId: 'cursor',
      provider: 'cursor',
      command: 'cursor-agent',
      cwd: '/tmp/cursor-ws',
      promptMode: 'stdin',
      configured: true,
    })
    expect(await getInstanceAdapterConfig('cursor')).toMatchObject({
      provider: 'cursor',
      instanceId: 'cursor',
      command: 'cursor-agent',
    })
  })

  it('treats a disabled CLI instance as not configured', async () => {
    instance('aider', 'aider', { enabled: 'false', command: 'aider' })
    expect((await getInstanceConfig('aider'))?.configured).toBe(false)
    expect(await getInstanceAdapterConfig('aider')).toBeNull()
  })

  it('keeps the secret token in the instance settings', async () => {
    instance('gw-1', 'openclaw', { url: 'http://localhost:4000', context_sync: 'pull' })
    settings.set('runtime.instances.gw-1.token', 'secret')

    expect(await getInstanceAdapterConfig('gw-1')).toMatchObject({
      provider: 'openclaw',
      instanceId: 'gw-1',
      url: 'http://localhost:4000',
      token: 'secret',
      contextSync: 'pull',
    })
  })

  it('passes the instance model and TAIA base URL to the adapter', async () => {
    instance('claude-team', 'anthropic', {
      model: 'claude-sonnet-5-5',
      taia_base_url: 'http://taia.internal:3000',
    })
    settings.set('runtime.instances.claude-team.token', 'sk-test')

    expect(await getInstanceAdapterConfig('claude-team')).toMatchObject({
      provider: 'anthropic',
      token: 'sk-test',
      model: 'claude-sonnet-5-5',
      taiaBaseUrl: 'http://taia.internal:3000',
    })
  })

  it('is standalone without a default instance', async () => {
    instance('gw-1', 'openclaw', { url: 'http://x' })
    expect(await getDefaultInstanceConfig()).toMatchObject({
      instanceId: null,
      provider: 'none',
      configured: false,
    })
  })

  it('runs an agent on its assigned instance, else on the default', async () => {
    settings.set('runtime.default_instance', 'gw-1')
    assignments.set('alex', 'gw-2')
    expect(await getAgentInstanceId('alex')).toBe('gw-2')
    expect(await getAgentInstanceId('sam')).toBe('gw-1')
  })

  it('lists configured instances with the default first', async () => {
    instance('a-gw', 'openclaw', { url: 'http://a' })
    instance('b-gw', 'openclaw', { url: 'http://b' })
    instance('c-key', 'anthropic')
    settings.set('runtime.default_instance', 'b-gw')

    const ids = (await listConfiguredInstances()).map((c) => c.instanceId)
    expect(ids).toEqual(['b-gw', 'a-gw'])
  })
})

describe('applyProviderSetting (settings UI bridge)', () => {
  it('writes provider fields to the instance named after the provider', async () => {
    expect(await applyProviderSetting('runtime.providers.openclaw.url', 'http://gw:18789')).toBe(
      true,
    )
    expect(await applyProviderSetting('runtime.providers.openclaw.token', 'secret')).toBe(true)

    expect(instances.get('openclaw')?.config).toEqual({ url: 'http://gw:18789' })
    expect(settings.get('runtime.instances.openclaw.token')).toBe('secret')
  })

  it('clears a field on delete or empty value', async () => {
    instance('openclaw', 'openclaw', { url: 'http://gw', context_sync: 'pull' })
    settings.set('runtime.instances.openclaw.token', 'secret')

    await applyProviderSetting('runtime.providers.openclaw.context_sync', '')
    await applyProviderSetting('runtime.providers.openclaw.token', null)

    expect(instances.get('openclaw')?.config).toEqual({ url: 'http://gw' })
    expect(settings.has('runtime.instances.openclaw.token')).toBe(false)
  })

  it('maps the default provider to the default instance', async () => {
    await applyProviderSetting('runtime.default_provider', 'anthropic')
    expect(settings.get('runtime.default_instance')).toBe('anthropic')
    expect(instances.has('anthropic')).toBe(true)

    await applyProviderSetting('runtime.default_provider', 'none')
    expect(settings.has('runtime.default_instance')).toBe(false)
  })

  it('ignores other keys', async () => {
    expect(await applyProviderSetting('app.default_tz', 'UTC')).toBe(false)
    expect(instances.size).toBe(0)
  })
})
