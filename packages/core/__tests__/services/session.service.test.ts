import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockListSessions = vi.fn()
const mockGetSessionHistory = vi.fn()

vi.mock(
  '@taia/core/runtime',
  async () => (await import('../helpers/fake-runtime-pool')).fakeRuntimePool.module,
)

const mockGetAllAgents = vi.fn()
const mockGetRuntimeSession = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAllAgents: (...args: any[]) => mockGetAllAgents(...args),
  getRuntimeSession: (...args: any[]) => mockGetRuntimeSession(...args),
}))

vi.mock('@taia/core/services/cost.service', () => ({
  calculateCost: vi.fn((tokens: number) => tokens * 0.00001),
  formatTokens: vi.fn((t: number) => `${t}`),
}))

import { fakeRuntimePool } from '../helpers/fake-runtime-pool'
import {
  computeSessionStatus,
  extractAgentId,
  formatTimeAgo,
  listSessions,
  getActiveSessions,
  getSessionDetail,
} from '@taia/core/services/session.service'

function sessionsAdapter(
  listSessions = mockListSessions,
  getSessionHistory = mockGetSessionHistory,
) {
  return {
    id: 'openclaw',
    capabilities: { has: () => true, list: () => [] },
    listSessions,
    getSessionHistory,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fakeRuntimePool.set({ gw: sessionsAdapter() })
  mockGetRuntimeSession.mockResolvedValue(null)
  mockGetAllAgents.mockResolvedValue([
    { id: 'dev', name: 'Developer', avatar: '👨‍💻' },
    { id: 'qa', name: 'QA Agent', avatar: '🧪' },
  ])
})

// ===================================================================
// Pure functions
// ===================================================================

describe('computeSessionStatus', () => {
  it('returns live for sessions within 3 minutes', () => {
    expect(computeSessionStatus(Date.now() - 60_000)).toBe('live')
    expect(computeSessionStatus(Date.now() - 2 * 60_000)).toBe('live')
  })

  it('returns idle for sessions between 3-15 minutes', () => {
    expect(computeSessionStatus(Date.now() - 5 * 60_000)).toBe('idle')
    expect(computeSessionStatus(Date.now() - 10 * 60_000)).toBe('idle')
  })

  it('returns offline for sessions older than 15 minutes', () => {
    expect(computeSessionStatus(Date.now() - 20 * 60_000)).toBe('offline')
    expect(computeSessionStatus(Date.now() - 60 * 60_000)).toBe('offline')
  })
})

describe('extractAgentId', () => {
  it('extracts agent id from standard key pattern', () => {
    expect(extractAgentId('agent:dev:main')).toBe('dev')
    expect(extractAgentId('agent:qa:abc123')).toBe('qa')
  })

  it('falls back to first segment for non-standard keys', () => {
    expect(extractAgentId('myagent/session1')).toBe('myagent')
  })

  it('returns unknown for empty keys', () => {
    expect(extractAgentId('')).toBe('unknown')
  })
})

describe('formatTimeAgo', () => {
  it('formats seconds ago', () => {
    expect(formatTimeAgo(Date.now() - 30_000)).toMatch(/\d+s ago/)
  })

  it('formats minutes ago', () => {
    expect(formatTimeAgo(Date.now() - 5 * 60_000)).toMatch(/\d+m ago/)
  })

  it('formats hours ago', () => {
    expect(formatTimeAgo(Date.now() - 3 * 60 * 60_000)).toMatch(/\d+h ago/)
  })

  it('formats days ago', () => {
    expect(formatTimeAgo(Date.now() - 2 * 24 * 60 * 60_000)).toMatch(/\d+d ago/)
  })
})

// ===================================================================
// listSessions
// ===================================================================

describe('listSessions', () => {
  it('returns enriched sessions sorted by updatedAt', async () => {
    const now = Date.now()
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: now - 60_000,
        model: 'claude-sonnet-4',
        totalTokens: 1000,
      },
      {
        key: 'agent:qa:main',
        sessionId: 's2',
        updatedAt: now - 30_000,
        model: 'claude-opus-4',
        totalTokens: 5000,
      },
    ])

    const sessions = await listSessions()

    expect(sessions).toHaveLength(2)
    // Sorted by updatedAt desc — qa first (more recent)
    expect(sessions[0].agentId).toBe('qa')
    expect(sessions[0].agentName).toBe('QA Agent')
    expect(sessions[0].agentAvatar).toBe('🧪')
    expect(sessions[0].status).toBe('live')
    expect(sessions[1].agentId).toBe('dev')
    expect(sessions[1].agentName).toBe('Developer')
  })

  it('filters by agent_id', async () => {
    const now = Date.now()
    mockListSessions.mockResolvedValue([
      { key: 'agent:dev:main', sessionId: 's1', updatedAt: now, model: 'm', totalTokens: 0 },
      { key: 'agent:qa:main', sessionId: 's2', updatedAt: now, model: 'm', totalTokens: 0 },
    ])

    const sessions = await listSessions({ agentId: 'dev' })

    expect(sessions).toHaveLength(1)
    expect(sessions[0].agentId).toBe('dev')
  })

  it('filters active sessions', async () => {
    const now = Date.now()
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: now - 60_000,
        model: 'm',
        totalTokens: 0,
      },
      {
        key: 'agent:qa:main',
        sessionId: 's2',
        updatedAt: now - 30 * 60_000,
        model: 'm',
        totalTokens: 0,
      },
    ])

    const sessions = await listSessions({ status: 'active' })

    expect(sessions).toHaveLength(1)
    expect(sessions[0].agentId).toBe('dev')
  })

  it('returns empty array when no sessions', async () => {
    mockListSessions.mockResolvedValue([])

    const sessions = await listSessions()

    expect(sessions).toEqual([])
  })

  it('handles agent enrichment failure gracefully', async () => {
    mockGetAllAgents.mockRejectedValue(new Error('DB down'))
    mockListSessions.mockResolvedValue([
      { key: 'agent:dev:main', sessionId: 's1', updatedAt: Date.now(), model: 'm', totalTokens: 0 },
    ])

    const sessions = await listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0].agentName).toBeUndefined()
  })

  it('calculates cost when tokens are present', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: Date.now(),
        model: 'claude-sonnet-4',
        totalTokens: 5000,
        inputTokens: 3000,
        outputTokens: 2000,
      },
    ])

    const sessions = await listSessions()

    expect(sessions[0].estimatedCostUsd).toBeDefined()
    expect(sessions[0].totalTokens).toBe(5000)
  })
})

// ===================================================================
// getActiveSessions
// ===================================================================

describe('getActiveSessions', () => {
  it('returns active sessions with context', async () => {
    const now = Date.now()
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: now - 30_000,
        model: 'claude-sonnet-4',
        totalTokens: 1000,
      },
    ])
    mockGetSessionHistory.mockResolvedValue([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'toolCall', name: 'read_file', arguments: { path: 'test.ts' } },
        ],
        id: 'm1',
      },
    ])

    const active = await getActiveSessions()

    expect(active).toHaveLength(1)
    expect(active[0].agentId).toBe('dev')
    expect(active[0].recentTools).toContain('read_file')
    expect(active[0].messagePreview).toBe('Hello')
    expect(active[0].currentAction).toBe('🔧 read_file')
  })

  it('returns empty when no active sessions', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: Date.now() - 30 * 60_000,
        model: 'm',
        totalTokens: 0,
      },
    ])

    const active = await getActiveSessions()

    expect(active).toEqual([])
  })

  it('handles history fetch errors gracefully', async () => {
    const now = Date.now()
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: now - 30_000,
        model: 'm',
        totalTokens: 0,
      },
    ])
    mockGetSessionHistory.mockRejectedValue(new Error('Timeout'))

    const active = await getActiveSessions()

    expect(active).toHaveLength(1)
    expect(active[0].recentTools).toEqual([])
  })
})

// ===================================================================
// getSessionDetail
// ===================================================================

describe('getSessionDetail', () => {
  it('returns full session detail with transcript', async () => {
    const now = Date.now()
    mockListSessions.mockResolvedValue([
      {
        key: 'agent:dev:main',
        sessionId: 's1',
        updatedAt: now - 60_000,
        model: 'claude-sonnet-4',
        totalTokens: 5000,
        inputTokens: 3000,
        outputTokens: 2000,
      },
    ])
    mockGetSessionHistory.mockResolvedValue([
      { role: 'user', content: 'Fix the bug', id: 'm1', timestamp: '2024-01-01T00:00:00Z' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I will fix it' }],
        id: 'm2',
        model: 'claude-sonnet-4',
      },
    ])

    const detail = await getSessionDetail('agent:dev:main')

    expect(detail).not.toBeNull()
    expect(detail!.agentId).toBe('dev')
    expect(detail!.agentName).toBe('Developer')
    expect(detail!.status).toBe('live')
    expect(detail!.messages).toHaveLength(2)
    expect(detail!.messages[0].role).toBe('user')
    expect(detail!.messages[0].text).toBe('Fix the bug')
    expect(detail!.messages[1].role).toBe('assistant')
    expect(detail!.totalTokens).toBe(5000)
  })

  it('returns null when session not found', async () => {
    mockListSessions.mockResolvedValue([])

    const detail = await getSessionDetail('agent:nonexistent:main')

    expect(detail).toBeNull()
  })

  it('filters tool messages from transcript', async () => {
    mockListSessions.mockResolvedValue([
      { key: 'agent:dev:main', sessionId: 's1', updatedAt: Date.now(), model: 'm', totalTokens: 0 },
    ])
    mockGetSessionHistory.mockResolvedValue([
      { role: 'user', content: 'Hello', id: 'm1' },
      { role: 'tool', content: 'tool result', id: 'm2' },
      { role: 'assistant', content: [{ type: 'text', text: 'Done' }], id: 'm3' },
    ])

    const detail = await getSessionDetail('agent:dev:main')

    expect(detail!.messages).toHaveLength(2)
    expect(detail!.messages.every((m) => m.role !== 'tool')).toBe(true)
  })

  it('simplifies assistant message parts correctly', async () => {
    mockListSessions.mockResolvedValue([
      { key: 'agent:dev:main', sessionId: 's1', updatedAt: Date.now(), model: 'm', totalTokens: 0 },
    ])
    mockGetSessionHistory.mockResolvedValue([
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me think...' },
          { type: 'text', text: 'Here is the answer' },
          { type: 'toolCall', name: 'write_file', arguments: { path: 'foo.ts' } },
        ],
        id: 'm1',
        model: 'claude-sonnet-4',
      },
    ])

    const detail = await getSessionDetail('agent:dev:main')
    const parts = detail!.messages[0].parts!

    expect(parts).toHaveLength(3)
    expect(parts[0].type).toBe('thinking')
    expect(parts[0].text).toBe('Let me think...')
    expect(parts[1].type).toBe('text')
    expect(parts[1].text).toBe('Here is the answer')
    expect(parts[2].type).toBe('tool')
    expect(parts[2].name).toBe('write_file')
  })
})

// ===================================================================
// Several runtime instances
// ===================================================================

describe('with several runtime instances', () => {
  const now = Date.now()
  const listA = vi.fn()
  const listB = vi.fn()
  const historyA = vi.fn()
  const historyB = vi.fn()

  beforeEach(() => {
    fakeRuntimePool.set({
      gw: sessionsAdapter(listA, historyA),
      api: sessionsAdapter(listB, historyB),
    })
    listA.mockResolvedValue([
      { key: 'agent:dev:main', sessionId: 'a1', updatedAt: now - 60_000 },
      { key: 'agent:dev:old', sessionId: 'a2', updatedAt: now - 90_000 },
    ])
    listB.mockResolvedValue([{ key: 'qa-run', agentId: 'qa', sessionId: 'b1', updatedAt: now }])
    historyA.mockResolvedValue([{ role: 'user', content: 'from gw' }])
    historyB.mockResolvedValue([{ role: 'user', content: 'from api' }])
  })

  it('merges every instance, newest first, each session tagged with its instance', async () => {
    const sessions = await listSessions()

    expect(sessions.map((s) => [s.key, s.instanceId])).toEqual([
      ['qa-run', 'api'],
      ['agent:dev:main', 'gw'],
      ['agent:dev:old', 'gw'],
    ])
  })

  it('applies the limit to the merged list', async () => {
    const sessions = await listSessions({ limit: 2 })

    expect(sessions.map((s) => s.key)).toEqual(['qa-run', 'agent:dev:main'])
  })

  it('reads the transcript from the instance the caller names', async () => {
    const detail = await getSessionDetail('qa-run', { instanceId: 'api' })

    expect(detail?.instanceId).toBe('api')
    expect(detail?.messages[0].text).toBe('from api')
    expect(listA).not.toHaveBeenCalled()
  })

  it('reads the transcript from the instance recorded for the session', async () => {
    mockGetRuntimeSession.mockResolvedValue({ session_key: 'qa-run', instance_id: 'api' })

    const detail = await getSessionDetail('qa-run')

    expect(detail?.instanceId).toBe('api')
    expect(listA).not.toHaveBeenCalled()
  })

  it('finds the owner among the instances when nothing records it', async () => {
    const detail = await getSessionDetail('agent:dev:main')

    expect(detail?.instanceId).toBe('gw')
    expect(detail?.messages[0].text).toBe('from gw')
    expect(historyB).not.toHaveBeenCalled()
  })
})
