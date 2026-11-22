import { describe, it, expect, vi, beforeEach } from 'vitest'
import { triggerAgentHeartbeat } from '@taia/core/services/trigger.service'

// Rate limits are covered in spend-limit.test.ts; here they let everything through.
vi.mock('@taia/core/spend-limit', () => ({
  withSpendLimit: (_name: string, _id: string, work: () => Promise<unknown>) => work(),
  SpendLimitError: class SpendLimitError extends Error {},
}))

const mockSpawnSession = vi.fn()

let hasCapability: (cap: string) => boolean = () => true
vi.mock('@taia/core/runtime', () => ({
  getRuntimeAdapterForAgent: vi.fn(() =>
    Promise.resolve({
      id: 'openclaw',
      capabilities: { has: (cap: string) => hasCapability(cap), list: () => [] },
      spawnSession: mockSpawnSession,
    }),
  ),
}))

const mockGetSettings = vi.fn()
vi.mock('@taia/core/services/agent-runtime-settings.service', () => ({
  getAgentRuntimeSettings: (...args: unknown[]) => mockGetSettings(...args),
}))

const mockLoadBundle = vi.fn()
vi.mock('@taia/core/services/context.service', () => ({
  loadAgentContextBundle: (...args: unknown[]) => mockLoadBundle(...args),
}))
const mockEnsureSynced = vi.fn(() => Promise.resolve())
vi.mock('@taia/core/services/context-sync.service', () => ({
  ensureAgentContextSynced: (...args: unknown[]) => mockEnsureSynced(...args),
}))
vi.mock('@taia/core/services/agent-context.service', () => ({
  getActiveBundleVersionIds: vi.fn(() => Promise.resolve({ agent_identity: 'aiv_1' })),
}))

const mockClaim = vi.fn()
const mockTrack = vi.fn(() => Promise.resolve())
const mockAbandon = vi.fn(() => Promise.resolve())
vi.mock('@taia/core/services/agent-run-lease.service', () => ({
  claimAgentRun: (...args: unknown[]) => mockClaim(...args),
  trackAgentRun: (...args: unknown[]) => mockTrack(...args),
  abandonAgentRun: (...args: unknown[]) => mockAbandon(...args),
}))

// Mock activity logging to avoid DB calls
vi.mock('@taia/core/services/activity.service', () => ({
  logAgentTriggered: vi.fn(() => Promise.resolve()),
}))

beforeEach(() => {
  vi.clearAllMocks()
  hasCapability = () => true
  mockClaim.mockResolvedValue({ start: true, leaseId: 'lease-1' })
  mockLoadBundle.mockResolvedValue(null)
  mockGetSettings.mockResolvedValue({
    model: { primary: 'anthropic/claude-opus-5-5', fallbacks: [] },
  })
})

describe('triggerAgentHeartbeat', () => {
  it('triggers heartbeat for any agent', async () => {
    mockSpawnSession.mockResolvedValue({
      sessionKey: 'sess-123',
      runId: 'run-456',
    })

    const result = await triggerAgentHeartbeat('agent-1')

    expect(result.ok).toBe(true)
    expect(result.agentId).toBe('agent-1')
    expect(result.message).toContain('agent-1')
    expect(result.sessionKey).toBe('sess-123')
    expect(result.runId).toBe('run-456')
  })

  it('starts a heartbeat run with the context bundle', async () => {
    const bundle = { agent: { id: 'agent-1' } }
    mockLoadBundle.mockResolvedValue(bundle)
    mockSpawnSession.mockResolvedValue({ sessionKey: 's', runId: 'r' })

    await triggerAgentHeartbeat('agent-1')

    expect(mockSpawnSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trigger: { kind: 'heartbeat' },
        context: bundle,
        bundleVersionIds: { agent_identity: 'aiv_1' },
      }),
    )
    expect(mockEnsureSynced).toHaveBeenCalledWith('agent-1')
  })

  it('sends correct payload to the runtime', async () => {
    mockSpawnSession.mockResolvedValue({
      sessionKey: 'sess-123',
      runId: 'run-456',
    })

    await triggerAgentHeartbeat('agent-1')

    expect(mockSpawnSession).toHaveBeenCalledWith(
      expect.stringContaining('Heartbeat'),
      expect.objectContaining({
        agentId: 'agent-1',
        label: expect.stringContaining('heartbeat-manual-'),
        runTimeoutSeconds: 300,
      }),
    )
  })

  it('returns error when gateway responds with error', async () => {
    mockSpawnSession.mockRejectedValue(new Error('HTTP 500: Internal Server Error'))

    const result = await triggerAgentHeartbeat('agent-1')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('500')
  })

  it('works for any agent id including custom ones', async () => {
    mockSpawnSession.mockResolvedValue({
      sessionKey: 'sess-789',
      runId: 'run-abc',
    })

    const result = await triggerAgentHeartbeat('custom-agent')

    expect(result.ok).toBe(true)
    expect(result.agentId).toBe('custom-agent')

    expect(mockSpawnSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agentId: 'custom-agent',
      }),
    )
  })

  it('passes the agent model to runtimes without per-agent settings', async () => {
    hasCapability = (cap) => cap !== 'agent_provisioning'
    mockSpawnSession.mockResolvedValue({ sessionKey: 's', runId: 'r' })

    await triggerAgentHeartbeat('agent-1')

    expect(mockSpawnSession.mock.calls[0][1].model).toBe('anthropic/claude-opus-5-5')
  })

  it('leaves the model to runtimes that hold per-agent settings', async () => {
    mockSpawnSession.mockResolvedValue({ sessionKey: 's', runId: 'r' })

    await triggerAgentHeartbeat('agent-1')

    expect(mockSpawnSession.mock.calls[0][1]).not.toHaveProperty('model')
    expect(mockGetSettings).not.toHaveBeenCalled()
  })
})

describe('triggerAgentHeartbeat: one run per agent', () => {
  it('coalesces into the running session without spawning', async () => {
    mockClaim.mockResolvedValue({
      start: false,
      running: {
        agentId: 'agent-1',
        leaseId: 'other',
        sessionKey: 'sess-live',
        runId: 'run-live',
        expiresAt: new Date(),
      },
    })

    const result = await triggerAgentHeartbeat('agent-1')

    expect(result).toMatchObject({
      ok: true,
      coalesced: true,
      sessionKey: 'sess-live',
      runId: 'run-live',
    })
    expect(mockSpawnSession).not.toHaveBeenCalled()
  })

  it('passes force to the claim and tracks the new run under its lease', async () => {
    mockSpawnSession.mockResolvedValue({ sessionKey: 'sess-1', runId: 'run-1' })

    await triggerAgentHeartbeat('agent-1', { force: true })

    expect(mockClaim).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ force: true, runTimeoutSeconds: 300 }),
    )
    expect(mockTrack).toHaveBeenCalledWith(
      'agent-1',
      'lease-1',
      expect.objectContaining({ sessionKey: 'sess-1' }),
      undefined,
    )
    expect(mockAbandon).not.toHaveBeenCalled()
  })

  it('waits for the end of the run when the runtime can report it', async () => {
    const awaitSessionComplete = vi.fn(() => Promise.resolve())
    const { getRuntimeAdapterForAgent } = await import('@taia/core/runtime')
    vi.mocked(getRuntimeAdapterForAgent).mockResolvedValueOnce({
      id: 'anthropic',
      capabilities: { has: () => true, list: () => [] },
      spawnSession: mockSpawnSession,
      awaitSessionComplete,
    } as never)
    mockSpawnSession.mockResolvedValue({ sessionKey: 'sess-1', runId: 'run-1' })

    await triggerAgentHeartbeat('agent-1')
    const awaitEnd = (mockTrack.mock.calls[0] as unknown[])[3] as () => Promise<void>
    await awaitEnd()

    expect(awaitSessionComplete).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: 'sess-1', runId: 'run-1' }),
      expect.objectContaining({ timeoutMs: 300_000 }),
    )
  })

  it('gives the lease back when the run fails to start', async () => {
    mockSpawnSession.mockRejectedValue(new Error('runtime down'))

    const result = await triggerAgentHeartbeat('agent-1')

    expect(result.ok).toBe(false)
    expect(mockAbandon).toHaveBeenCalledWith('agent-1', 'lease-1')
    expect(mockTrack).not.toHaveBeenCalled()
  })

  it('starts without a lease when the claim gives none', async () => {
    mockClaim.mockResolvedValue({ start: true, leaseId: null })
    mockSpawnSession.mockResolvedValue({ sessionKey: 'sess-1', runId: 'run-1' })

    expect((await triggerAgentHeartbeat('agent-1')).ok).toBe(true)
    expect(mockTrack).not.toHaveBeenCalled()
  })
})
