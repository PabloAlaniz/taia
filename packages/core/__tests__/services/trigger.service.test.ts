import { describe, it, expect, vi, beforeEach } from 'vitest'
import { triggerAgentHeartbeat } from '@taia/core/services/trigger.service'

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

// Mock activity logging to avoid DB calls
vi.mock('@taia/core/services/activity.service', () => ({
  logAgentTriggered: vi.fn(() => Promise.resolve()),
}))

beforeEach(() => {
  vi.clearAllMocks()
  hasCapability = () => true
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
