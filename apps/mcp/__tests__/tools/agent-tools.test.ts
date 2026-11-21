import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchEnrichedAgents = vi.fn()
const mockGetAllAgents = vi.fn()

vi.mock('@taia/core/services/agent.service', () => ({
  fetchEnrichedAgents: (...args: any[]) => mockFetchEnrichedAgents(...args),
}))

vi.mock('@taia/core/db', () => ({
  getAllAgents: (...args: any[]) => mockGetAllAgents(...args),
}))

import { listAgentsTool, agentTools } from '../../src/tools/agent-tools'

const SAMPLE_AGENTS = [
  {
    id: 'agent-1',
    name: 'Coder',
    role: 'developer',
    status: 'idle',
    type: 'claude',
    enabled: true,
    nextRunIn: '5m',
  },
  {
    id: 'agent-2',
    name: 'Reviewer',
    role: 'reviewer',
    status: 'active',
    type: 'claude',
    enabled: true,
    nextRunIn: null,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listAgentsTool', () => {
  it('has correct name and description', () => {
    expect(listAgentsTool.name).toBe('taia_list_agents')
    expect(listAgentsTool.description).toBeTruthy()
  })

  it('returns enriched agents with source', async () => {
    mockFetchEnrichedAgents.mockResolvedValue({ agents: SAMPLE_AGENTS, source: 'live' })

    const result = await listAgentsTool.handler({})

    expect(result).toEqual({
      agents: [
        {
          id: 'agent-1',
          name: 'Coder',
          role: 'developer',
          status: 'idle',
          type: 'claude',
          enabled: true,
          nextRunIn: '5m',
        },
        {
          id: 'agent-2',
          name: 'Reviewer',
          role: 'reviewer',
          status: 'active',
          type: 'claude',
          enabled: true,
          nextRunIn: null,
        },
      ],
      source: 'live',
    })
    expect(mockFetchEnrichedAgents).toHaveBeenCalledWith(false)
  })

  it('falls back to DB-only on error', async () => {
    mockFetchEnrichedAgents.mockRejectedValue(new Error('Gateway unavailable'))
    mockGetAllAgents.mockResolvedValue([
      { id: 'agent-1', name: 'Coder', role: 'developer', type: 'claude', enabled: true },
    ])

    const result = await listAgentsTool.handler({})

    expect(result).toEqual({
      agents: [{ id: 'agent-1', name: 'Coder', role: 'developer', type: 'claude', enabled: true }],
      source: 'database-only',
    })
    expect(mockGetAllAgents).toHaveBeenCalledWith(true)
  })
})

describe('agentTools array', () => {
  it('has 1 item', () => {
    expect(agentTools).toHaveLength(1)
  })
})
