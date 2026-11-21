import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEnrichedAgents, createAgent, removeAgent } from '@taia/core/services/agent.service'
import { fakeRuntimePool } from '../helpers/fake-runtime-pool'

const mockGetAllAgents = vi.fn()
const mockGetAllTasks = vi.fn()
const mockCreateAgent = vi.fn()
const mockSetAgentRuntimeInstanceId = vi.fn()
const mockGetAgentById = vi.fn()
const mockDeleteAgent = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAllAgents: (...args: any[]) => mockGetAllAgents(...args),
  getAllTasks: (...args: any[]) => mockGetAllTasks(...args),
  getAgentById: (...args: any[]) => mockGetAgentById(...args),
  createAgent: (...args: any[]) => mockCreateAgent(...args),
  deleteAgent: (...args: any[]) => mockDeleteAgent(...args),
  setAgentRuntimeInstanceId: (...args: any[]) => mockSetAgentRuntimeInstanceId(...args),
}))

const mockSaveAgentIdentity = vi.fn()
vi.mock('@taia/core/services/agent-context.service', () => ({
  buildInitialIdentity: (agent: { id: string; name: string; role: string }) => ({
    ...agent,
    persona: '',
  }),
  saveAgentIdentity: (...args: any[]) => mockSaveAgentIdentity(...args),
}))

const mockProvision = vi.fn()
const mockDeprovision = vi.fn()
vi.mock('@taia/core/services/agent-runtime-settings.service', () => ({
  provisionAgentsInRuntime: (...args: any[]) => mockProvision(...args),
  deprovisionAgentFromRuntime: (...args: any[]) => mockDeprovision(...args),
}))

const assignedInstances: Record<string, string> = {}
vi.mock('@taia/core/runtime-instances', () => ({
  getDefaultInstanceId: async () => 'gw',
  loadAgentInstanceResolver: async () => (agentId: string) => assignedInstances[agentId] ?? 'gw',
}))

const mockGetAgentContextSummary = vi.fn()
vi.mock('@taia/core/services/context.service', () => ({
  getAgentContextSummary: (...args: any[]) => mockGetAgentContextSummary(...args),
}))

const mockListAgentsClient = vi.fn()
const mockListCrons = vi.fn()

vi.mock(
  '@taia/core/runtime',
  async () => (await import('../helpers/fake-runtime-pool')).fakeRuntimePool.module,
)

function runtimeAdapter(listAgents = mockListAgentsClient, listCrons = mockListCrons) {
  return {
    id: 'openclaw',
    capabilities: { has: () => true, list: () => [] },
    listAgents,
    listCrons,
  }
}

vi.mock('@taia/core/agent-runtime', () => ({
  getNextHeartbeat: vi.fn((agentId: string, _cronExpr?: string) => {
    if (agentId === 'agent-1') return { nextRunAtMs: Date.now() + 300000, nextRunIn: '5m' }
    return null
  }),
}))

const RUNTIME_AGENTS = [
  { id: 'agent-1', name: 'Agent 1', configured: true },
  { id: 'agent-5', name: 'Agent 5', configured: true },
]

const DB_AGENTS = [
  {
    id: 'agent-1',
    name: 'Agent 1',
    role: 'Dev',
    avatar: '\u{1F4BB}',
    enabled: 1,
    type: 'cron',
  },
  {
    id: 'agent-5',
    name: 'Agent 5',
    role: 'Tester',
    avatar: '\u{1F513}',
    enabled: 1,
    type: 'cron',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  fakeRuntimePool.set({ gw: runtimeAdapter() })
  for (const key of Object.keys(assignedInstances)) delete assignedInstances[key]

  mockGetAllAgents.mockResolvedValue([
    { id: 'agent-1', role: 'Dev', avatar: '\u{1F4BB}', enabled: 1 },
  ])
  mockGetAllTasks.mockResolvedValue([
    { id: 't1', assigned_to: 'agent-1', status: 'IN_PROGRESS', tags: [] },
    { id: 't2', assigned_to: 'agent-5', status: 'DONE', tags: [] },
  ])

  mockListAgentsClient.mockResolvedValue(RUNTIME_AGENTS)
  mockListCrons.mockResolvedValue([])

  // Default: return empty file info
  mockGetAgentContextSummary.mockResolvedValue({
    persona: false,
    instructions: false,
    workingNotes: false,
    memoryFiles: [],
  })
})

describe('fetchEnrichedAgents', () => {
  it('returns enriched agents with correct status from the runtime', async () => {
    const result = await fetchEnrichedAgents(false)

    expect(result.source).toBe('runtime')
    expect(result.agents.length).toBeGreaterThanOrEqual(2)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1).toBeDefined()
    expect(agent1!.status).toBe('WORKING')
    expect(agent1!.name).toBe('Agent 1')
  })

  it('sets IDLE status for agents without active tasks', async () => {
    const result = await fetchEnrichedAgents(false)
    const agent5 = result.agents.find((a) => a.id === 'agent-5')
    expect(agent5).toBeDefined()
    expect(agent5!.status).toBe('IDLE')
  })

  it('includes nextRunIn from heartbeat', async () => {
    const result = await fetchEnrichedAgents(false)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1!.nextRunIn).toBe('5m')
  })

  it('uses DB metadata for role and avatar', async () => {
    const result = await fetchEnrichedAgents(false)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1!.role).toBe('Dev')
    expect(agent1!.avatar).toBe('\u{1F4BB}')
  })

  it('detects BLOCKED status from tags', async () => {
    mockGetAllTasks.mockResolvedValue([
      {
        id: 't1',
        assigned_to: 'agent-1',
        status: 'IN_PROGRESS',
        tags: ['blocked'],
      },
    ])

    const result = await fetchEnrichedAgents(false)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1!.status).toBe('WORKING')
  })

  it('detects BLOCKED status when agent only has blocked tasks (no active)', async () => {
    mockGetAllTasks.mockResolvedValue([
      { id: 't1', assigned_to: 'agent-5', status: 'REVIEW', tags: ['blocked'] },
    ])

    const result = await fetchEnrichedAgents(false)
    const agent5 = result.agents.find((a) => a.id === 'agent-5')
    expect(agent5!.status).toBe('BLOCKED')
  })

  it('sorts orchestrator first', async () => {
    mockGetAllAgents.mockResolvedValue([
      {
        id: 'agent-1',
        role: 'Dev',
        avatar: '\u{1F4BB}',
        enabled: 1,
        type: 'cron',
      },
      {
        id: 'main',
        role: 'Orchestrator',
        avatar: '\u{1F33C}',
        enabled: 1,
        type: 'orchestrator',
      },
      {
        id: 'agent-5',
        role: 'Tester',
        avatar: '\u{1F513}',
        enabled: 1,
        type: 'cron',
      },
    ])
    mockListAgentsClient.mockResolvedValue([
      { id: 'agent-1', name: 'Agent 1' },
      { id: 'main', name: 'Main' },
      { id: 'agent-5', name: 'Agent 5' },
    ])

    const result = await fetchEnrichedAgents(false)
    expect(result.agents[0].id).toBe('main')
    expect(result.agents[0].type).toBe('orchestrator')
  })

  it('uses default role/avatar when no DB metadata', async () => {
    const result = await fetchEnrichedAgents(false)
    const agent5 = result.agents.find((a) => a.id === 'agent-5')
    expect(agent5!.role).toBeDefined()
    expect(agent5!.avatar).toBeDefined()
  })

  it('sets enabled=false when DB has enabled=0', async () => {
    mockGetAllAgents.mockResolvedValue([
      { id: 'agent-1', role: 'Dev', avatar: '\u{1F4BB}', enabled: 0 },
    ])

    const result = await fetchEnrichedAgents(false)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1!.enabled).toBe(false)
  })

  it('includes cron, files, and task counts when fullDetail=true', async () => {
    mockListCrons.mockResolvedValue([
      {
        id: 'cron-1',
        agentId: 'agent-1',
        enabled: true,
        schedule: { kind: 'cron', expr: '0 */2 * * *' },
        state: {
          nextRunAtMs: Date.now() + 600000,
          lastRunAtMs: Date.now() - 300000,
          lastStatus: 'ok',
          lastDurationMs: 1200,
        },
      },
    ])

    mockGetAgentContextSummary.mockResolvedValue({
      persona: true,
      instructions: true,
      workingNotes: false,
      memoryFiles: ['notes.md'],
    })

    const result = await fetchEnrichedAgents(true)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')

    expect(agent1!.cron).toBeDefined()
    expect(agent1!.cron!.schedule).toBe('every 2h')
    expect(agent1!.cron!.enabled).toBe(true)
    expect(agent1!.context).toBeDefined()
    expect(agent1!.tasks).toBeDefined()
    expect(agent1!.tasks!.inProgress).toBe(1)
  })

  it('handles fetchCrons failure gracefully in fullDetail mode', async () => {
    mockListCrons.mockRejectedValue(new Error('cron API down'))

    const result = await fetchEnrichedAgents(true)

    expect(result.agents.length).toBeGreaterThan(0)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1!.cron).toBeUndefined()
  })

  // --- Database fallback tests ---

  it('falls back to DB agents when the runtime API fails', async () => {
    mockListAgentsClient.mockRejectedValue(new Error('API down'))
    mockGetAllAgents.mockResolvedValue(DB_AGENTS)

    const result = await fetchEnrichedAgents(false)

    expect(result.source).toBe('database-fallback')
    expect(result.agents.length).toBe(2)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1).toBeDefined()
    expect(agent1!.name).toBe('Agent 1')
    expect(agent1!.role).toBe('Dev')
    expect(agent1!.avatar).toBe('\u{1F4BB}')
  })

  it('falls back to DB when the runtime returns empty agents', async () => {
    mockListAgentsClient.mockResolvedValue([])
    mockGetAllAgents.mockResolvedValue(DB_AGENTS)

    const result = await fetchEnrichedAgents(false)

    expect(result.source).toBe('database-fallback')
    expect(result.agents.length).toBe(2)
  })

  it('returns empty agents when both runtime and DB fail to return agents', async () => {
    mockListAgentsClient.mockRejectedValue(new Error('API down'))
    mockGetAllAgents.mockResolvedValue([])

    const result = await fetchEnrichedAgents(false)

    expect(result.source).toBe('database-fallback')
    expect(result.agents).toEqual([])
  })

  // --- Human agent tests ---

  it('includes human agents from DB even when not in the runtime', async () => {
    mockGetAllAgents.mockResolvedValue([
      {
        id: 'agent-1',
        role: 'Dev',
        avatar: '\u{1F4BB}',
        enabled: 1,
        type: 'cron',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        role: 'Lead',
        avatar: '\u{1F464}',
        enabled: 1,
        type: 'human',
      },
    ])
    mockGetAllTasks.mockResolvedValue([])

    const result = await fetchEnrichedAgents(false)

    expect(result.source).toBe('runtime')
    const agent3 = result.agents.find((a) => a.id === 'agent-3')
    expect(agent3).toBeDefined()
    expect(agent3!.name).toBe('Agent 3')
    expect(agent3!.role).toBe('Lead')
    expect(agent3!.avatar).toBe('\u{1F464}')
    expect(agent3!.type).toBe('human')
    expect(agent3!.status).toBe('IDLE')
    expect(agent3!.enabled).toBe(true)
  })

  it('includes task counts for human agents when fullDetail=true', async () => {
    mockGetAllAgents.mockResolvedValue([
      {
        id: 'agent-1',
        role: 'Dev',
        avatar: '\u{1F4BB}',
        enabled: 1,
        type: 'cron',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        role: 'Lead',
        avatar: '\u{1F464}',
        enabled: 1,
        type: 'human',
      },
    ])
    mockGetAllTasks.mockResolvedValue([
      { id: 't1', assigned_to: 'agent-3', status: 'IN_PROGRESS', tags: [] },
      { id: 't2', assigned_to: 'agent-3', status: 'DONE', tags: [] },
    ])
    mockListCrons.mockResolvedValue([])

    const result = await fetchEnrichedAgents(true)
    const agent3 = result.agents.find((a) => a.id === 'agent-3')

    expect(agent3).toBeDefined()
    expect(agent3!.status).toBe('WORKING')
    expect(agent3!.tasks).toBeDefined()
    expect(agent3!.tasks!.inProgress).toBe(1)
    expect(agent3!.tasks!.done).toBe(1)
  })

  it('does not duplicate a human agent that also exists in the runtime', async () => {
    mockGetAllAgents.mockResolvedValue([
      {
        id: 'agent-1',
        role: 'Dev',
        avatar: '\u{1F4BB}',
        enabled: 1,
        type: 'cron',
      },
      {
        id: 'agent-3',
        name: 'Agent 3',
        role: 'Lead',
        avatar: '\u{1F464}',
        enabled: 1,
        type: 'human',
      },
    ])
    mockListAgentsClient.mockResolvedValue([...RUNTIME_AGENTS, { id: 'agent-3', name: 'Agent 3' }])
    mockGetAllTasks.mockResolvedValue([])

    const result = await fetchEnrichedAgents(false)
    const agent3Instances = result.agents.filter((a) => a.id === 'agent-3')
    expect(agent3Instances).toHaveLength(1)
  })

  it('throws when both the runtime and DB fail', async () => {
    mockListAgentsClient.mockRejectedValue(new Error('API down'))
    mockGetAllAgents.mockRejectedValue(new Error('DB connection failed'))

    await expect(fetchEnrichedAgents(false)).rejects.toThrow('DB connection failed')
  })

  it('fallback agents include correct task status enrichment', async () => {
    mockListAgentsClient.mockRejectedValue(new Error('API down'))
    mockGetAllAgents.mockResolvedValue(DB_AGENTS)
    mockGetAllTasks.mockResolvedValue([
      { id: 't1', assigned_to: 'agent-1', status: 'IN_PROGRESS', tags: [] },
      { id: 't2', assigned_to: 'agent-5', status: 'REVIEW', tags: ['blocked'] },
    ])

    const result = await fetchEnrichedAgents(false)

    const agent1 = result.agents.find((a) => a.id === 'agent-1')
    expect(agent1!.status).toBe('WORKING')

    const agent5 = result.agents.find((a) => a.id === 'agent-5')
    expect(agent5!.status).toBe('BLOCKED')
  })

  it('fallback includes task counts in fullDetail mode', async () => {
    mockListAgentsClient.mockRejectedValue(new Error('API down'))
    mockGetAllAgents.mockResolvedValue(DB_AGENTS)
    mockGetAllTasks.mockResolvedValue([
      { id: 't1', assigned_to: 'agent-1', status: 'IN_PROGRESS', tags: [] },
      { id: 't2', assigned_to: 'agent-1', status: 'DONE', tags: [] },
    ])

    const result = await fetchEnrichedAgents(true)
    const agent1 = result.agents.find((a) => a.id === 'agent-1')

    expect(agent1!.tasks).toBeDefined()
    expect(agent1!.tasks!.inProgress).toBe(1)
    expect(agent1!.tasks!.done).toBe(1)
    expect(agent1!.cron).toBeUndefined()
  })
})

describe('fetchEnrichedAgents with several runtime instances', () => {
  const listB = vi.fn()
  const cronsB = vi.fn()

  beforeEach(() => {
    fakeRuntimePool.set({
      gw: runtimeAdapter(),
      api: runtimeAdapter(listB, cronsB),
    })
    mockGetAllAgents.mockResolvedValue(DB_AGENTS)
    listB.mockResolvedValue([{ id: 'agent-5', name: 'Agent 5' }])
    cronsB.mockResolvedValue([
      {
        id: 'cron-b',
        agentId: 'agent-5',
        enabled: true,
        schedule: { kind: 'cron', expr: '5 * * * *' },
      },
    ])
    mockListAgentsClient.mockResolvedValue([{ id: 'agent-1', name: 'Agent 1' }])
    mockListCrons.mockResolvedValue([
      // A job for agent-5 on the instance it does not run on.
      {
        id: 'cron-a',
        agentId: 'agent-5',
        enabled: true,
        schedule: { kind: 'cron', expr: '0 * * * *' },
      },
    ])
  })

  it('lists the agents of every instance, each with the cron of its own instance', async () => {
    assignedInstances['agent-5'] = 'api'

    const result = await fetchEnrichedAgents(true)

    expect(result.source).toBe('runtime')
    expect(result.agents.map((a) => a.id).sort()).toEqual(['agent-1', 'agent-5'])
    expect(result.agents.find((a) => a.id === 'agent-5')!.cron!.id).toBe('cron-b')
  })

  it('assigns an agent first seen on another instance to that instance', async () => {
    mockGetAllAgents.mockResolvedValueOnce([DB_AGENTS[0]]).mockResolvedValue(DB_AGENTS)

    await fetchEnrichedAgents(false)

    expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-5' }))
    expect(mockSetAgentRuntimeInstanceId).toHaveBeenCalledWith('agent-5', 'api')
  })

  it('keeps the agents of an instance that does not answer, from the database', async () => {
    assignedInstances['agent-5'] = 'api'
    listB.mockRejectedValue(new Error('gateway down'))

    const result = await fetchEnrichedAgents(false)

    expect(result.source).toBe('runtime')
    const agent5 = result.agents.find((a) => a.id === 'agent-5')
    expect(agent5).toMatchObject({ name: 'Agent 5', role: 'Tester' })
  })
})

describe('createAgent', () => {
  beforeEach(() => {
    mockCreateAgent.mockReset()
    mockSaveAgentIdentity.mockReset()
    mockProvision.mockReset()
  })

  it('creates the record, seeds a clean identity and provisions the runtime', async () => {
    const data = { id: 'new', name: 'New Agent', role: 'Writer' }
    const record = { ...data, type: 'cron', enabled: 1 }
    const report = { ok: true, instances: { gw: { provider: 'openclaw' } } }
    mockCreateAgent.mockResolvedValue(record)
    mockProvision.mockResolvedValue(report)

    const result = await createAgent(data)

    expect(mockCreateAgent).toHaveBeenCalledWith(data)
    expect(mockSaveAgentIdentity).toHaveBeenCalledWith(
      'new',
      expect.objectContaining({
        id: 'new',
        name: 'New Agent',
        role: 'Writer',
        persona: '',
      }),
      expect.objectContaining({ createdBy: 'api' }),
    )
    expect(mockProvision).toHaveBeenCalledWith([{ id: 'new', name: 'New Agent' }])
    expect(result).toEqual({ agent: record, runtimeProvisioning: report })
  })

  it('does not provision humans', async () => {
    mockCreateAgent.mockResolvedValue({
      id: 'ana',
      name: 'Ana',
      type: 'human',
      enabled: 1,
    })

    const result = await createAgent({ id: 'ana', name: 'Ana', type: 'human' })

    expect(mockSaveAgentIdentity).toHaveBeenCalled()
    expect(mockProvision).not.toHaveBeenCalled()
    expect(result.runtimeProvisioning).toBeNull()
  })
})

describe('removeAgent', () => {
  beforeEach(() => {
    mockGetAgentById.mockReset()
    mockDeleteAgent.mockReset()
    mockDeprovision.mockReset()
  })

  it('deprovisions before deleting and returns the report', async () => {
    const order: string[] = []
    mockGetAgentById.mockResolvedValue({ id: 'a1', name: 'A1', type: 'cron' })
    mockDeprovision.mockImplementation(async () => {
      order.push('deprovision')
      return { instanceId: 'gw', status: 'removed' }
    })
    mockDeleteAgent.mockImplementation(async () => {
      order.push('delete')
      return true
    })

    const result = await removeAgent('a1')

    expect(order).toEqual(['deprovision', 'delete'])
    expect(result).toEqual({
      runtimeDeprovisioning: { instanceId: 'gw', status: 'removed' },
    })
  })

  it('still deletes when the runtime fails', async () => {
    mockGetAgentById.mockResolvedValue({ id: 'a1', name: 'A1', type: 'cron' })
    mockDeprovision.mockResolvedValue({
      instanceId: 'gw',
      status: 'failed',
      error: 'down',
    })
    mockDeleteAgent.mockResolvedValue(true)

    const result = await removeAgent('a1')

    expect(mockDeleteAgent).toHaveBeenCalledWith('a1')
    expect(result?.runtimeDeprovisioning?.status).toBe('failed')
  })

  it('skips the runtime for humans', async () => {
    mockGetAgentById.mockResolvedValue({
      id: 'ana',
      name: 'Ana',
      type: 'human',
    })
    mockDeleteAgent.mockResolvedValue(true)

    expect(await removeAgent('ana')).toEqual({ runtimeDeprovisioning: null })
    expect(mockDeprovision).not.toHaveBeenCalled()
  })

  it('returns null for an unknown agent', async () => {
    mockGetAgentById.mockResolvedValue(null)

    expect(await removeAgent('nope')).toBeNull()
    expect(mockDeleteAgent).not.toHaveBeenCalled()
  })
})
