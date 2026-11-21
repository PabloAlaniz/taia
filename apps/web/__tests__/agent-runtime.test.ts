import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the OpenClaw client
const mockListAgents = vi.fn()
const mockListSessions = vi.fn()
const mockGetSessionHistory = vi.fn()
const mockSpawnSession = vi.fn()

vi.mock('@taia/core/runtime', () => {
  const adapter = () =>
    Promise.resolve({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      listAgents: mockListAgents,
      listSessions: mockListSessions,
      getSessionHistory: mockGetSessionHistory,
      spawnSession: mockSpawnSession,
    })
  // One instance; a rejection counts as that instance failing.
  return {
    forEachRuntime: async (fn: (a: unknown, id: string) => Promise<unknown>) => {
      try {
        return {
          results: [{ instanceId: 'gw', value: await fn(await adapter(), 'gw') }],
          failures: [],
        }
      } catch (err) {
        return { results: [], failures: [{ instanceId: 'gw', error: String(err) }] }
      }
    },
    mergeAgentListings: async (results: Array<{ instanceId: string; value: unknown[] }>) =>
      results.flatMap(({ instanceId, value }) =>
        value.map((item) => ({ instanceId, value: item })),
      ),
    getRuntimeAdapterForAgent: vi.fn(adapter),
  }
})

import {
  getNextHeartbeat,
  spawnAgent,
  listAgents,
  getAgentSessions,
  readTranscript,
  getAgentInfo,
  listAgentsWithStatus,
  listSessions,
} from '@taia/core/agent-runtime'

beforeEach(() => {
  vi.clearAllMocks()
})

// --- getNextHeartbeat ---

describe('getNextHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when no cron expression provided', () => {
    const result = getNextHeartbeat('any-agent')
    expect(result).toBeNull()
  })

  it('calculates next heartbeat from cron expression', () => {
    vi.setSystemTime(new Date('2026-02-04T10:05:00Z'))
    const result = getNextHeartbeat('agent-1', '0,15,30,45 * * * *')

    expect(result).not.toBeNull()
    expect(result!.nextRunIn).toContain('m')
  })

  it('works with any cron expression', () => {
    vi.setSystemTime(new Date('2026-02-04T10:10:00Z'))
    const result = getNextHeartbeat('custom', '2,17,32,47 * * * *')

    expect(result).not.toBeNull()
    expect(result!.nextRunAtMs).toBeGreaterThan(Date.now())
  })

  it('wraps to next hour when past all scheduled minutes', () => {
    vi.setSystemTime(new Date('2026-02-04T10:50:00Z'))
    const result = getNextHeartbeat('agent', '0,15,30,45 * * * *')

    expect(result).not.toBeNull()
    const nextRun = new Date(result!.nextRunAtMs)
    expect(nextRun.getUTCHours()).toBe(11)
    expect(nextRun.getUTCMinutes()).toBe(0)
  })

  it('returns time in seconds when less than a minute away', () => {
    vi.setSystemTime(new Date('2026-02-04T10:14:45Z'))
    const result = getNextHeartbeat('agent', '0,15,30,45 * * * *')

    expect(result).not.toBeNull()
    expect(result!.nextRunIn).toContain('s')
  })

  it('returns null for invalid cron expression', () => {
    const result = getNextHeartbeat('agent', 'invalid')
    expect(result).toBeNull()
  })
})

// --- spawnAgent ---

describe('spawnAgent', () => {
  it('spawns via the runtime and returns session info', async () => {
    mockSpawnSession.mockResolvedValue({
      sessionKey: 'sess-123',
      runId: 'run-456',
    })

    const result = await spawnAgent('agent-1', 'Test task')

    expect(result.ok).toBe(true)
    expect(result.sessionKey).toBe('sess-123')
    expect(result.runId).toBe('run-456')
  })

  it('returns error on failure', async () => {
    mockSpawnSession.mockRejectedValue(new Error('Connection refused'))

    const result = await spawnAgent('agent-1', 'Test task')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})

// --- listAgents ---

describe('listAgents', () => {
  it('returns agent IDs from client', async () => {
    mockListAgents.mockResolvedValue([{ id: 'agent-1' }, { id: 'agent-5' }, { id: 'main' }])

    const result = await listAgents()
    expect(result).toEqual(['agent-1', 'agent-5', 'main'])
  })

  it('returns empty array on error', async () => {
    mockListAgents.mockRejectedValue(new Error('Offline'))

    const result = await listAgents()
    expect(result).toEqual([])
  })
})

// --- getAgentSessions ---

describe('getAgentSessions', () => {
  it('returns sessions filtered by agent ID', async () => {
    mockListSessions.mockResolvedValue([
      { key: 'agent:agent-1:main', agentId: 'agent-1', sessionId: 's1', updatedAt: 1000 },
      { key: 'agent:agent-5:main', agentId: 'agent-5', sessionId: 's2', updatedAt: 2000 },
      { key: 'anthropic:agent-1:run-9', agentId: 'agent-1', sessionId: 's3', updatedAt: 3000 },
      { key: 'agent:agent-1:orphan', sessionId: 's4', updatedAt: 4000 },
    ])

    const result = await getAgentSessions('agent-1')

    expect(result).toHaveLength(2)
    expect(result[0].sessionId).toBe('s1')
    expect(result[1].sessionId).toBe('s3')
  })

  it('returns empty array on error', async () => {
    mockListSessions.mockRejectedValue(new Error('Offline'))

    const result = await getAgentSessions('agent-1')
    expect(result).toEqual([])
  })
})

// --- readTranscript ---

describe('readTranscript', () => {
  it("reads the agent's most recent session and drops tool messages", async () => {
    mockListSessions.mockResolvedValue([
      { key: 'old', agentId: 'agent-1', sessionId: 'a', updatedAt: 1000 },
      { key: 'latest', agentId: 'agent-1', sessionId: 'b', updatedAt: 2000 },
    ])
    mockGetSessionHistory.mockResolvedValue([
      { role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00Z' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
        timestamp: '2026-01-01T00:00:01Z',
      },
      { role: 'tool', content: 'result' },
    ])

    const result = await readTranscript('agent-1', 'session-123', 10)

    expect(mockGetSessionHistory).toHaveBeenCalledWith('latest', { limit: 10 })
    // Should filter out tool messages
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    expect(result[1].role).toBe('assistant')
  })

  it('returns empty array when the agent has no sessions', async () => {
    mockListSessions.mockResolvedValue([])

    expect(await readTranscript('agent-1', 'session-123')).toEqual([])
    expect(mockGetSessionHistory).not.toHaveBeenCalled()
  })

  it('returns empty array on error', async () => {
    mockListSessions.mockResolvedValue([
      { key: 'k', agentId: 'agent-1', sessionId: 'a', updatedAt: 1 },
    ])
    mockGetSessionHistory.mockRejectedValue(new Error('Offline'))

    const result = await readTranscript('agent-1', 'session-123')
    expect(result).toEqual([])
  })
})

// --- getAgentInfo ---

describe('getAgentInfo', () => {
  it('returns null when agent has no sessions', async () => {
    mockListSessions.mockResolvedValue([])

    const result = await getAgentInfo('agent-1')
    expect(result).toBeNull()
  })

  it('returns agent info with sessions sorted by updatedAt desc', async () => {
    mockListSessions.mockResolvedValue([
      { key: 'agent:agent-1:main', agentId: 'agent-1', sessionId: 's-old', updatedAt: 1000 },
      { key: 'agent:agent-1:other', agentId: 'agent-1', sessionId: 's-new', updatedAt: 2000 },
    ])

    const result = await getAgentInfo('agent-1')

    expect(result).not.toBeNull()
    expect(result!.id).toBe('agent-1')
    expect(result!.sessions).toHaveLength(2)
    expect(result!.latestSession!.sessionId).toBe('s-new')
  })
})

// --- listAgentsWithStatus ---

describe('listAgentsWithStatus', () => {
  it('returns agents with sessions, filters out nulls', async () => {
    mockListAgents.mockResolvedValue([{ id: 'agent-1' }, { id: 'agent-5' }])

    // Only agent1 has sessions
    mockListSessions.mockResolvedValue([
      { key: 'agent:agent-1:main', agentId: 'agent-1', sessionId: 's1', updatedAt: 1000 },
    ])

    const result = await listAgentsWithStatus()

    // agent1 has sessions, agent5 does not
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('agent-1')
  })
})

// --- listSessions ---

describe('listSessions', () => {
  it('returns sessions from client', async () => {
    mockListSessions.mockResolvedValue([
      { key: 'agent:agent-1:main', agentId: 'agent-1', sessionId: 's1', updatedAt: 3000 },
      { key: 'agent:agent-5:main', agentId: 'agent-5', sessionId: 's2', updatedAt: 1000 },
      { key: 'agent:agent-1:other', agentId: 'agent-1', sessionId: 's3', updatedAt: 5000 },
    ])

    const result = await listSessions()

    expect(result.ok).toBe(true)
    expect(result.sessions).toHaveLength(3)
  })

  it('returns empty sessions on error', async () => {
    mockListSessions.mockRejectedValue(new Error('Offline'))

    const result = await listSessions()

    expect(result.ok).toBe(true)
    expect(result.sessions).toEqual([])
  })
})
