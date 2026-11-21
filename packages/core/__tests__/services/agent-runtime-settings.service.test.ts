import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRow = vi.fn()
const mockUpsert = vi.fn()
const mockGetRuntimeSettings = vi.fn()
const mockProvisionAgent = vi.fn()
const mockUpdateAgentSettings = vi.fn()
const mockAdapterSettings = vi.fn()
const mockSetRuntimeDefaults = vi.fn()
const mockDeprovisionAgent = vi.fn()
let provisioning = true

vi.mock('@taia/core/db', () => ({
  getAgentRuntimeSettingsRow: (...a: unknown[]) => mockGetRow(...a),
  upsertAgentRuntimeSettings: (...a: unknown[]) => mockUpsert(...a),
}))
vi.mock('@taia/core/services/runtime-settings.service', () => ({
  getRuntimeSettings: (...a: unknown[]) => mockGetRuntimeSettings(...a),
}))

function fakeAdapter() {
  return {
    id: 'openclaw',
    capabilities: { has: () => provisioning },
    provisionAgent: mockProvisionAgent,
    updateAgentSettings: mockUpdateAgentSettings,
    getRuntimeSettings: mockAdapterSettings,
    setRuntimeDefaults: mockSetRuntimeDefaults,
    deprovisionAgent: mockDeprovisionAgent,
  }
}
const mockGetRuntimeAdapter = vi.fn(async (_instanceId: string) => fakeAdapter())
vi.mock('@taia/core/runtime', () => ({
  getRuntimeAdapter: (id: string) => mockGetRuntimeAdapter(id),
  getRuntimeAdapterForAgent: vi.fn(async () => fakeAdapter()),
}))

const assignedInstances: Record<string, string> = {}
let defaultInstance: string | null = 'gw'
vi.mock('@taia/core/runtime-instances', () => ({
  getAgentInstanceId: async (agentId: string) => assignedInstances[agentId] ?? defaultInstance,
  loadAgentInstanceResolver: async () => (agentId: string) =>
    assignedInstances[agentId] ?? defaultInstance,
}))

import {
  deprovisionAgentFromRuntime,
  getAgentRuntimeSettings,
  getEffectiveAgentRuntimeSettings,
  provisionAgentsInRuntime,
  updateAgentRuntimeSettings,
} from '@taia/core/services/agent-runtime-settings.service'

const opus = { primary: 'anthropic/claude-opus-5-5', fallbacks: [] }

beforeEach(() => {
  vi.clearAllMocks()
  provisioning = true
  defaultInstance = 'gw'
  for (const key of Object.keys(assignedInstances)) delete assignedInstances[key]
  mockGetRow.mockResolvedValue(null)
  mockAdapterSettings.mockResolvedValue({
    defaults: {},
    agents: {},
    revision: 'h1',
  })
})

describe('getAgentRuntimeSettings', () => {
  it('maps the stored row and drops unset columns', async () => {
    mockGetRow.mockResolvedValue({
      agent_id: 'dev',
      model: opus,
      denied_tools: [],
      workspace: null,
    })
    expect(await getAgentRuntimeSettings('dev')).toEqual({ model: opus })
  })

  it('is empty for an agent that inherits everything', async () => {
    expect(await getAgentRuntimeSettings('dev')).toEqual({})
  })
})

describe('updateAgentRuntimeSettings', () => {
  it('merges the change, stores it and pushes it to the runtime', async () => {
    mockGetRow.mockResolvedValue({
      agent_id: 'dev',
      model: opus,
      denied_tools: ['exec'],
    })
    mockUpdateAgentSettings.mockResolvedValue({ status: 'updated' })

    const change = await updateAgentRuntimeSettings('dev', {
      deniedTools: null,
      workspace: '/w',
    })

    expect(change.settings).toEqual({ model: opus, workspace: '/w' })
    expect(mockUpsert).toHaveBeenCalledWith('dev', {
      model: opus,
      workspace: '/w',
    })
    // The runtime gets the change itself, so untouched fields stay as they are.
    expect(mockUpdateAgentSettings).toHaveBeenCalledWith('dev', {
      deniedTools: null,
      workspace: '/w',
    })
    expect(change.runtime).toEqual({ status: 'updated' })
  })

  it('only stores the change when the runtime has no per-agent settings', async () => {
    provisioning = false

    const change = await updateAgentRuntimeSettings('dev', { model: opus })

    expect(mockUpsert).toHaveBeenCalledWith('dev', { model: opus })
    expect(mockUpdateAgentSettings).not.toHaveBeenCalled()
    expect(change.runtime).toBeNull()
  })
})

describe('getEffectiveAgentRuntimeSettings', () => {
  it('prefers TAIA, then the runtime agent, then the runtime default', async () => {
    mockGetRow.mockResolvedValue({ agent_id: 'dev', denied_tools: ['exec'] })
    mockGetRuntimeSettings.mockResolvedValue({
      provider: 'openclaw',
      supported: true,
      settings: {
        defaults: { model: opus },
        agents: { dev: { deniedTools: ['web'], workspace: '/w-dev' } },
      },
    })

    expect(await getEffectiveAgentRuntimeSettings('dev')).toEqual({
      agentId: 'dev',
      provider: 'openclaw',
      desired: { deniedTools: ['exec'] },
      settings: { model: opus, deniedTools: ['exec'], workspace: '/w-dev' },
      source: { model: 'default', deniedTools: 'taia', workspace: 'runtime' },
    })
  })

  it('reports only TAIA settings when the runtime publishes none', async () => {
    mockGetRow.mockResolvedValue({ agent_id: 'dev', model: opus })
    mockGetRuntimeSettings.mockResolvedValue({
      provider: 'anthropic',
      supported: false,
    })

    const view = await getEffectiveAgentRuntimeSettings('dev')

    expect(view.settings).toEqual({ model: opus })
    expect(view.source).toEqual({ model: 'taia' })
  })
})

describe('provisionAgentsInRuntime', () => {
  const agents = [
    { id: 'writer', name: 'Writer' },
    { id: 'tester', name: 'Tester' },
  ]

  it('provisions each agent with its desired settings', async () => {
    mockGetRow.mockImplementation(async (id: string) =>
      id === 'writer' ? { agent_id: id, model: opus } : null,
    )
    mockProvisionAgent.mockResolvedValue({ status: 'created' })

    const report = await provisionAgentsInRuntime(agents)

    expect(mockProvisionAgent).toHaveBeenNthCalledWith(1, {
      id: 'writer',
      name: 'Writer',
      settings: { model: opus },
    })
    expect(mockProvisionAgent).toHaveBeenNthCalledWith(2, {
      id: 'tester',
      name: 'Tester',
      settings: {},
    })
    expect(report).toEqual({
      ok: true,
      instances: {
        gw: {
          provider: 'openclaw',
          supported: true,
          ok: true,
          agents: {
            writer: { status: 'created' },
            tester: { status: 'created' },
          },
        },
      },
    })
  })

  it('reports the agents that failed, with their manual hints', async () => {
    mockProvisionAgent.mockResolvedValueOnce({ status: 'exists' }).mockResolvedValueOnce({
      status: 'failed',
      error: 'denied',
      manualHint: 'run x',
    })

    const report = await provisionAgentsInRuntime(agents)

    expect(report.ok).toBe(false)
    expect(report.instances.gw.error).toBe('Could not provision tester')
    expect(report.instances.gw.agents.tester.manualHint).toBe('run x')
  })

  it('is a no-op for runtimes without agents of their own', async () => {
    provisioning = false

    const report = await provisionAgentsInRuntime(agents)

    expect(report).toEqual({
      ok: true,
      instances: {
        gw: { provider: 'openclaw', supported: false, ok: true, agents: {} },
      },
    })
    expect(mockProvisionAgent).not.toHaveBeenCalled()
  })

  it('provisions each agent on the instance it runs on', async () => {
    assignedInstances.tester = 'gw-b'
    mockProvisionAgent.mockResolvedValue({ status: 'created' })

    const report = await provisionAgentsInRuntime(agents)

    expect(mockGetRuntimeAdapter.mock.calls.map(([id]) => id).sort()).toEqual(['gw', 'gw-b'])
    expect(Object.keys(report.instances.gw.agents)).toEqual(['writer'])
    expect(Object.keys(report.instances['gw-b'].agents)).toEqual(['tester'])
  })

  it('has nothing to provision in standalone mode', async () => {
    defaultInstance = null

    expect(await provisionAgentsInRuntime(agents)).toEqual({
      ok: true,
      instances: {},
    })
    expect(mockGetRuntimeAdapter).not.toHaveBeenCalled()
  })

  it('gives a default model without fallbacks a failover chain', async () => {
    mockProvisionAgent.mockResolvedValue({ status: 'created' })
    mockAdapterSettings.mockResolvedValue({
      defaults: { model: opus },
      agents: {},
      revision: 'h7',
    })

    await provisionAgentsInRuntime(agents)

    expect(mockSetRuntimeDefaults).toHaveBeenCalledWith(
      {
        model: {
          primary: 'anthropic/claude-opus-5-5',
          fallbacks: ['anthropic/claude-sonnet-5-5', 'anthropic/claude-haiku-5-5'],
        },
      },
      { expectedRevision: 'h7' },
    )
  })

  it('keeps a default model that already has fallbacks', async () => {
    mockProvisionAgent.mockResolvedValue({ status: 'created' })
    mockAdapterSettings.mockResolvedValue({
      defaults: { model: { primary: 'a/b', fallbacks: ['c/d'] } },
      agents: {},
    })

    await provisionAgentsInRuntime(agents)

    expect(mockSetRuntimeDefaults).not.toHaveBeenCalled()
  })
})

describe('deprovisionAgentFromRuntime', () => {
  it('removes the agent from its assigned instance', async () => {
    assignedInstances.dev = 'gw2'
    expect(await deprovisionAgentFromRuntime('dev')).toEqual({
      instanceId: 'gw2',
      status: 'removed',
    })
    expect(mockGetRuntimeAdapter).toHaveBeenCalledWith('gw2')
    expect(mockDeprovisionAgent).toHaveBeenCalledWith('dev')
  })

  it('reports runtimes without agent provisioning as unsupported', async () => {
    provisioning = false
    expect(await deprovisionAgentFromRuntime('dev')).toEqual({
      instanceId: 'gw',
      status: 'unsupported',
    })
    expect(mockDeprovisionAgent).not.toHaveBeenCalled()
  })

  it('is unsupported in standalone mode', async () => {
    defaultInstance = null
    expect(await deprovisionAgentFromRuntime('dev')).toEqual({
      instanceId: null,
      status: 'unsupported',
    })
  })

  it('reports a failure instead of throwing', async () => {
    mockDeprovisionAgent.mockRejectedValueOnce(new Error('gateway down'))
    expect(await deprovisionAgentFromRuntime('dev')).toEqual({
      instanceId: 'gw',
      status: 'failed',
      error: 'gateway down',
    })
  })
})
