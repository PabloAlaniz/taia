import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockSpawnSession = vi.fn()
const mockGetSessionHistory = vi.fn()
const mockAwaitSessionComplete = vi.fn()
const mockUpdateAgentIdentity = vi.fn()
const mockSetSetting = vi.fn()
const mockGetSetting = vi.fn()

vi.mock('../../src/runtime', () => ({
  getDefaultRuntimeAdapter: vi.fn(() =>
    Promise.resolve({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      spawnSession: mockSpawnSession,
      getSessionHistory: mockGetSessionHistory,
      awaitSessionComplete: mockAwaitSessionComplete,
    }),
  ),
}))

vi.mock('../../src/db/index', () => ({
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}))

vi.mock('../../src/services/agent-context.service', () => ({
  updateAgentIdentity: (...args: unknown[]) => mockUpdateAgentIdentity(...args),
}))

import {
  enrichAgentIdentities,
  getEnrichmentStatus,
  parseEnrichedIdentity,
  _setPollInterval,
} from '@taia/core/services/enrichment.service'

// --- Helpers ---

const testAgents = [
  { id: 'code-reviewer', name: 'Code Reviewer', role: 'Reviews code quality' },
  { id: 'qa-tester', name: 'QA Tester', role: 'Runs automated tests' },
]

const identityReply = {
  persona: 'Meticulous reviewer who explains every finding.',
  instructions: '- Review the oldest PR first\n- Leave actionable notes',
  constraints: ['Never approve your own changes'],
}

function replyWith(text: string) {
  mockGetSessionHistory.mockResolvedValue([
    { role: 'assistant', content: [{ type: 'text', text }] },
  ])
}

function lastStatus() {
  const calls = mockSetSetting.mock.calls.filter(([key]) => key === 'enrichment.status')
  return JSON.parse(calls[calls.length - 1][1])
}

beforeEach(() => {
  vi.clearAllMocks()
  _setPollInterval(0)
  mockSetSetting.mockResolvedValue(undefined)
  mockUpdateAgentIdentity.mockResolvedValue({ versionId: 'v2' })
  mockSpawnSession.mockResolvedValue({ sessionKey: 'enrich-sess-123', runId: 'r1' })
  mockAwaitSessionComplete.mockResolvedValue(undefined)
  replyWith(JSON.stringify(identityReply))
})

describe('enrichAgentIdentities', () => {
  it('writes initial status with all agents as pending', async () => {
    await enrichAgentIdentities(testAgents)
    const first = JSON.parse(mockSetSetting.mock.calls[0][1])
    expect(first.agents).toEqual({ 'code-reviewer': 'pending', 'qa-tester': 'pending' })
  })

  it('spawns one session per agent with a JSON identity prompt', async () => {
    await enrichAgentIdentities([testAgents[0]])

    expect(mockSpawnSession).toHaveBeenCalledOnce()
    const [prompt, options] = mockSpawnSession.mock.calls[0]
    expect(prompt).toContain('Code Reviewer')
    expect(prompt).toContain('"persona"')
    expect(prompt).not.toMatch(/https?:\/\//)
    expect(options.label).toBe('taia-enrich-code-reviewer')
  })

  it('saves the drafted persona, instructions and constraints as a new identity version', async () => {
    await enrichAgentIdentities([testAgents[0]])

    expect(mockUpdateAgentIdentity).toHaveBeenCalledWith('code-reviewer', identityReply, {
      createdBy: 'enrichment',
      note: expect.any(String),
    })
    expect(lastStatus().agents['code-reviewer']).toBe('done')
  })

  it('accepts JSON wrapped in prose or code fences', async () => {
    replyWith('Here you go:\n```json\n' + JSON.stringify(identityReply) + '\n```')
    await enrichAgentIdentities([testAgents[0]])
    expect(mockUpdateAgentIdentity).toHaveBeenCalledOnce()
  })

  it('marks the agent failed and keeps the identity when the reply is not valid', async () => {
    replyWith('I could not do that.')
    await enrichAgentIdentities([testAgents[0]])

    expect(mockUpdateAgentIdentity).not.toHaveBeenCalled()
    expect(lastStatus().agents['code-reviewer']).toBe('failed')
  })

  it('marks agent as failed on spawn error', async () => {
    mockSpawnSession.mockRejectedValueOnce(new Error('runtime down'))
    await enrichAgentIdentities([testAgents[0]])
    expect(lastStatus().agents['code-reviewer']).toBe('failed')
  })

  it('processes multiple agents independently (one failure does not block others)', async () => {
    mockSpawnSession
      .mockRejectedValueOnce(new Error('runtime down'))
      .mockResolvedValueOnce({ sessionKey: 's2', runId: 'r2' })

    await enrichAgentIdentities(testAgents)

    const status = lastStatus().agents
    expect(Object.values(status).sort()).toEqual(['done', 'failed'])
    expect(mockUpdateAgentIdentity).toHaveBeenCalledOnce()
  })
})

describe('parseEnrichedIdentity', () => {
  it('requires persona and instructions, defaulting constraints', () => {
    expect(parseEnrichedIdentity('{"persona":"p","instructions":"i"}')).toEqual({
      persona: 'p',
      instructions: 'i',
      constraints: [],
    })
    expect(parseEnrichedIdentity('{"persona":"p"}')).toBeNull()
    expect(parseEnrichedIdentity('no json here')).toBeNull()
  })
})

describe('getEnrichmentStatus', () => {
  it('returns null when no status exists', async () => {
    mockGetSetting.mockResolvedValue(null)

    const status = await getEnrichmentStatus()
    expect(status).toBeNull()
  })

  it('returns parsed status from settings', async () => {
    const stored = {
      startedAt: new Date().toISOString(),
      agents: { 'code-reviewer': 'done', 'qa-tester': 'pending' },
    }
    mockGetSetting.mockResolvedValue(JSON.stringify(stored))

    const status = await getEnrichmentStatus()
    expect(status?.agents['code-reviewer']).toBe('done')
    expect(status?.agents['qa-tester']).toBe('pending')
  })

  it('marks stale pending agents as failed after 15 minutes', async () => {
    const staleDate = new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 min ago
    const stored = {
      startedAt: staleDate,
      agents: { 'code-reviewer': 'done', 'qa-tester': 'enriching_soul' },
    }
    mockGetSetting.mockResolvedValue(JSON.stringify(stored))

    const status = await getEnrichmentStatus()
    expect(status?.agents['code-reviewer']).toBe('done') // Completed — untouched
    expect(status?.agents['qa-tester']).toBe('failed') // Stale — marked failed
  })
})
