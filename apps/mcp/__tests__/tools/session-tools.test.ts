import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListSessions = vi.fn()
const mockGetActiveSessions = vi.fn()
const mockGetSessionDetail = vi.fn()

vi.mock('@taia/core/services/session.service', () => ({
  listSessions: (...args: any[]) => mockListSessions(...args),
  getActiveSessions: (...args: any[]) => mockGetActiveSessions(...args),
  getSessionDetail: (...args: any[]) => mockGetSessionDetail(...args),
}))

import {
  listSessionsTool,
  getActiveSessionsTool,
  getSessionTool,
  sessionTools,
} from '../../src/tools/session-tools'

const SAMPLE_SESSION = {
  key: 'sess-abc',
  agentId: 'agent-1',
  agentName: 'Coder',
  status: 'active',
  model: 'claude-3.5-sonnet',
  lastActivityAgo: '2m ago',
  estimatedCostUsd: 0.45,
}

const SAMPLE_ACTIVE_SESSION = {
  key: 'sess-abc',
  agentId: 'agent-1',
  agentName: 'Coder',
  status: 'active',
  currentAction: 'Writing code',
  recentTools: ['Read', 'Edit'],
  messagePreview: 'Implementing auth module...',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listSessionsTool', () => {
  it('has correct name and description', () => {
    expect(listSessionsTool.name).toBe('taia_list_sessions')
    expect(listSessionsTool.description).toBeTruthy()
  })

  it('returns sessions', async () => {
    mockListSessions.mockResolvedValue([SAMPLE_SESSION])

    const result = await listSessionsTool.handler({})

    expect(result).toEqual({
      sessions: [
        {
          key: 'sess-abc',
          agentId: 'agent-1',
          agentName: 'Coder',
          status: 'active',
          model: 'claude-3.5-sonnet',
          lastActivityAgo: '2m ago',
          estimatedCostUsd: 0.45,
        },
      ],
    })
  })

  it('passes filters', async () => {
    mockListSessions.mockResolvedValue([])

    await listSessionsTool.handler({ agentId: 'agent-1', status: 'active', limit: 10 })

    expect(mockListSessions).toHaveBeenCalledWith({
      agentId: 'agent-1',
      status: 'active',
      limit: 10,
    })
  })
})

describe('getActiveSessionsTool', () => {
  it('has correct name and description', () => {
    expect(getActiveSessionsTool.name).toBe('taia_get_active_sessions')
    expect(getActiveSessionsTool.description).toBeTruthy()
  })

  it('returns active sessions', async () => {
    mockGetActiveSessions.mockResolvedValue([SAMPLE_ACTIVE_SESSION])

    const result = await getActiveSessionsTool.handler({})

    expect(result).toEqual({
      sessions: [
        {
          key: 'sess-abc',
          agentId: 'agent-1',
          agentName: 'Coder',
          status: 'active',
          currentAction: 'Writing code',
          recentTools: ['Read', 'Edit'],
          messagePreview: 'Implementing auth module...',
        },
      ],
    })
  })
})

describe('getSessionTool', () => {
  it('has correct name and description', () => {
    expect(getSessionTool.name).toBe('taia_get_session')
    expect(getSessionTool.description).toBeTruthy()
  })

  it('returns session detail', async () => {
    const detail = { ...SAMPLE_SESSION, messages: [{ role: 'assistant', content: 'Done' }] }
    mockGetSessionDetail.mockResolvedValue(detail)

    const result = await getSessionTool.handler({ sessionKey: 'sess-abc' })

    expect(result).toEqual(detail)
    expect(mockGetSessionDetail).toHaveBeenCalledWith('sess-abc', { limit: undefined })
  })

  it('throws when session not found', async () => {
    mockGetSessionDetail.mockResolvedValue(null)

    await expect(getSessionTool.handler({ sessionKey: 'sess-999' })).rejects.toThrow(
      'Session sess-999 not found',
    )
  })
})

describe('sessionTools array', () => {
  it('has 3 items', () => {
    expect(sessionTools).toHaveLength(3)
  })
})
