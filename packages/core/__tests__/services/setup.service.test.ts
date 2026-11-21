import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks (must be declared before vi.mock calls) ---

const mockSpawnSession = vi.fn()
const mockGetSessionHistory = vi.fn()
const mockAwaitSessionComplete = vi.fn()

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

import { generateSetup } from '@taia/core/services/setup.service'

// Rate limits are covered in spend-limit.test.ts; here they let everything through.
vi.mock('@taia/core/spend-limit', () => ({
  withSpendLimit: (_name: string, _id: string, work: () => Promise<unknown>) => work(),
  SpendLimitError: class SpendLimitError extends Error {},
}))

const validSetupJson = {
  workspace: {
    name: 'My Workspace',
    icon: '🚀',
    columns: [
      { slug: 'TODO', label: 'Todo', icon: '📋', is_initial_state: true, is_done_state: false },
      { slug: 'DONE', label: 'Done', icon: '✅', is_initial_state: false, is_done_state: true },
    ],
  },
  agents: [
    {
      id: 'writer',
      name: 'Writer',
      role: 'Writes content',
      avatar: '✍️',
      type: 'cron',
      cron_schedule: '0 */6 * * *',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAwaitSessionComplete.mockResolvedValue(undefined)
  mockSpawnSession.mockResolvedValue({ sessionKey: 'setup-sess-1', runId: 'run-1' })
})

// ===================================================================
// generateSetup
// ===================================================================

describe('generateSetup', () => {
  function mockAssistant(content: unknown) {
    mockGetSessionHistory.mockResolvedValue([{ role: 'assistant', content }])
  }

  it('returns parsed setup from valid JSON', async () => {
    mockAssistant(JSON.stringify(validSetupJson))

    const result = await generateSetup('I need a writer')

    expect(result.workspace.name).toBe('My Workspace')
    expect(result.agents[0].id).toBe('writer')
  })

  it('calls spawnSession with the onboarding label and a 120s run timeout', async () => {
    mockAssistant(JSON.stringify(validSetupJson))

    await generateSetup('anything')

    expect(mockSpawnSession).toHaveBeenCalledWith(
      expect.stringContaining("User's need: anything"),
      expect.objectContaining({ label: 'taia-onboarding-setup', runTimeoutSeconds: 120 }),
    )
  })

  it('awaits session completion with runId + sessionKey', async () => {
    mockAssistant(JSON.stringify(validSetupJson))

    await generateSetup('anything')

    expect(mockAwaitSessionComplete).toHaveBeenCalledWith(
      { runId: 'run-1', sessionKey: 'setup-sess-1' },
      expect.objectContaining({ timeoutMs: 90_000 }),
    )
  })

  it('throws when awaitSessionComplete rejects', async () => {
    mockAwaitSessionComplete.mockRejectedValue(new Error('awaitSessionComplete: timeout'))

    await expect(generateSetup('anything')).rejects.toThrow(/Setup session timed out/)
  })

  it('throws when the session returns no assistant message', async () => {
    mockGetSessionHistory.mockResolvedValue([])

    await expect(generateSetup('anything')).rejects.toThrow(/Setup session timed out/)
  })

  it('handles thinking blocks in the assistant content', async () => {
    mockAssistant([
      { type: 'thinking', thinking: 'analyzing...' },
      { type: 'text', text: JSON.stringify(validSetupJson) },
    ])

    const result = await generateSetup('anything')

    expect(result.workspace.name).toBe('My Workspace')
  })

  it('throws on invalid JSON in the response', async () => {
    mockAssistant('this is not json')

    await expect(generateSetup('anything')).rejects.toThrow(/Failed to parse/)
  })

  it('throws on valid JSON with wrong schema', async () => {
    mockAssistant(JSON.stringify({ agents: [] })) // missing workspace

    await expect(generateSetup('anything')).rejects.toThrow(/Invalid setup structure/)
  })
})
