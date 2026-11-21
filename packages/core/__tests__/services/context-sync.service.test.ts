import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSync = vi.fn()
const mockUpsertSync = vi.fn()
const mockLoadBundle = vi.fn()
const mockAdapterSync = vi.fn()
let hasContextSync = true

vi.mock('@taia/core/db', () => ({
  getAgentContextSync: (...a: unknown[]) => mockGetSync(...a),
  upsertAgentContextSync: (...a: unknown[]) => mockUpsertSync(...a),
}))
vi.mock('@taia/core/services/context.service', () => ({
  loadAgentContextBundle: (...a: unknown[]) => mockLoadBundle(...a),
}))
vi.mock('@taia/core/runtime', () => ({
  getRuntimeAdapterForAgent: vi.fn(async () => ({
    id: 'openclaw',
    capabilities: { has: () => hasContextSync },
    syncAgentContext: (...a: unknown[]) => mockAdapterSync(...a),
  })),
}))

import {
  ensureAgentContextSynced,
  syncAgentContext,
} from '@taia/core/services/context-sync.service'

const bundle = { agent: { id: 'alex' } }
const state = { mode: 'push', fingerprint: 'fp2', remoteHashes: { 'SOUL.md': 'h2' } }

beforeEach(() => {
  vi.clearAllMocks()
  hasContextSync = true
  mockLoadBundle.mockResolvedValue(bundle)
  mockGetSync.mockResolvedValue({
    mode: 'push',
    fingerprint: 'fp1',
    remote_hashes: { 'SOUL.md': 'h1' },
  })
})

describe('syncAgentContext', () => {
  it('hands the adapter the last state and records a push', async () => {
    mockAdapterSync.mockResolvedValue({ status: 'pushed', state, changedPaths: ['SOUL.md'] })

    const outcome = await syncAgentContext('alex', { force: true })

    expect(outcome?.status).toBe('pushed')
    expect(mockAdapterSync).toHaveBeenCalledWith({
      agentId: 'alex',
      bundle,
      previous: { mode: 'push', fingerprint: 'fp1', remoteHashes: { 'SOUL.md': 'h1' } },
      force: true,
    })
    expect(mockUpsertSync).toHaveBeenCalledWith('alex', 'openclaw', {
      mode: 'push',
      status: 'pushed',
      fingerprint: 'fp2',
      remoteHashes: { 'SOUL.md': 'h2' },
      conflicts: [],
      lastError: null,
      synced: true,
    })
  })

  it('records conflicts without marking the agent as synced', async () => {
    const conflicts = [{ path: 'SOUL.md', remoteHash: 'hx' }]
    mockAdapterSync.mockResolvedValue({ status: 'conflict', state, conflicts })

    await syncAgentContext('alex')

    expect(mockUpsertSync).toHaveBeenCalledWith(
      'alex',
      'openclaw',
      expect.objectContaining({ status: 'conflict', conflicts, synced: false }),
    )
  })

  it('records the error and rethrows when the runtime fails', async () => {
    mockAdapterSync.mockRejectedValue(new Error('gateway down'))

    await expect(syncAgentContext('alex')).rejects.toThrow('gateway down')
    expect(mockUpsertSync).toHaveBeenCalledWith(
      'alex',
      'openclaw',
      expect.objectContaining({ status: 'error', lastError: 'gateway down', fingerprint: 'fp1' }),
    )
  })

  it('does nothing for runtimes without ContextSync or agents without identity', async () => {
    hasContextSync = false
    expect(await syncAgentContext('alex')).toBeNull()

    hasContextSync = true
    mockLoadBundle.mockResolvedValue(null)
    expect(await syncAgentContext('alex')).toBeNull()
    expect(mockAdapterSync).not.toHaveBeenCalled()
  })
})

describe('ensureAgentContextSynced', () => {
  it('never throws', async () => {
    mockAdapterSync.mockRejectedValue(new Error('gateway down'))
    await expect(ensureAgentContextSynced('alex')).resolves.toBeUndefined()
  })
})
