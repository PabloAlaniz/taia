import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetOrCreateClient = vi.fn()
const mockGetAllTasks = vi.fn()
const mockGetActiveIdentity = vi.fn()

// One instance ("gw") backed by mockGetOrCreateClient; a rejection counts as
// that instance failing, like the real fan-out.
vi.mock('@taia/core/runtime', () => ({
  forEachRuntime: async (fn: (adapter: unknown, id: string) => Promise<unknown>) => {
    try {
      return {
        results: [{ instanceId: 'gw', value: await fn(await mockGetOrCreateClient(), 'gw') }],
        failures: [],
      }
    } catch (err) {
      return { results: [], failures: [{ instanceId: 'gw', error: String(err) }] }
    }
  },
  mergeAgentListings: async (results: Array<{ instanceId: string; value: unknown[] }>) =>
    results.flatMap(({ instanceId, value }) => value.map((item) => ({ instanceId, value: item }))),
}))

vi.mock('@taia/core/db', () => ({
  // No columns known: statuses are read by their names.
  getColumnStates: async () => [],
  getAllTasks: (...args: any[]) => mockGetAllTasks(...args),
}))

vi.mock('@taia/core/services/agent-context.service', () => ({
  getActiveIdentity: (...args: any[]) => mockGetActiveIdentity(...args),
}))

import { GET } from '@/app/api/agents/config/route'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAllTasks.mockResolvedValue([])
  mockGetActiveIdentity.mockResolvedValue(undefined)
})

describe('GET /api/agents/config', () => {
  it('returns agent configurations', async () => {
    mockGetOrCreateClient.mockResolvedValue({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      getRuntimeSettings: vi.fn().mockResolvedValue({
        defaults: { model: { primary: 'anthropic/claude-opus-5-5', fallbacks: [] } },
        agents: {
          'agent-1': {
            name: 'Agent 1',
            model: { primary: 'anthropic/claude-sonnet-5-5', fallbacks: [] },
            deniedTools: ['bash'],
          },
        },
      }),
      listCrons: vi.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          schedule: { expr: '*/5 * * * *' },
          payload: { timeoutSeconds: 120 },
          state: { nextRunAtMs: 1700000000000 },
        },
      ]),
    })
    mockGetActiveIdentity.mockResolvedValueOnce({
      role: 'Assistant',
      persona: '# Bot\n\nA helpful assistant\nMore text',
    })
    mockGetAllTasks.mockResolvedValueOnce([{ assigned_to: 'agent-1', status: 'IN_PROGRESS' }])

    const res = await GET()
    const data = await res.json()

    expect(data.agents).toHaveLength(1)
    expect(data.agents[0].id).toBe('agent-1')
    expect(data.agents[0].model).toBe('anthropic/claude-sonnet-5-5')
    expect(data.agents[0].tools.denied).toEqual(['bash'])
    expect(data.agents[0].heartbeat.schedule).toBe('*/5 * * * *')
    expect(data.agents[0].personaSummary).toBe('A helpful assistant')
    expect(data.agents[0].workingStatus).toBe('IN_PROGRESS')
  })

  it('handles missing soul and working files', async () => {
    mockGetOrCreateClient.mockResolvedValue({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      getRuntimeSettings: vi.fn().mockResolvedValue({
        defaults: { model: { primary: 'anthropic/claude-opus-5-5', fallbacks: [] } },
        agents: { bob: { name: 'Bob' } },
      }),
      listCrons: vi.fn().mockResolvedValue([]),
    })
    mockGetActiveIdentity.mockResolvedValue(undefined)
    mockGetAllTasks.mockResolvedValue([])

    const res = await GET()
    const data = await res.json()

    expect(data.agents[0].personaSummary).toBe('')
    expect(data.agents[0].workingStatus).toBe('IDLE')
    // No model of its own: the runtime default applies.
    expect(data.agents[0].model).toBe('anthropic/claude-opus-5-5')
  })

  it('returns no agents when the runtime does not publish settings', async () => {
    mockGetOrCreateClient.mockResolvedValue({
      id: 'anthropic',
      capabilities: { has: () => false, list: () => [] },
    })

    expect(await (await GET()).json()).toEqual({ agents: [] })
  })

  it('leaves out the agents of a runtime that does not answer', async () => {
    mockGetOrCreateClient.mockRejectedValue(new Error('Connection refused'))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ agents: [] })
  })
})
