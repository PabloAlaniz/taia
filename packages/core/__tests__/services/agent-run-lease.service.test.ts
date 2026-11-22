import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const acquire = vi.fn()
const attach = vi.fn(() => Promise.resolve())
const release = vi.fn(() => Promise.resolve())
vi.mock('@taia/core/db/repositories/agent-run-lease.repository', () => ({
  acquireAgentRunLease: (...args: unknown[]) => acquire(...args),
  attachAgentRunSession: (...args: unknown[]) => attach(...args),
  releaseAgentRunLease: (...args: unknown[]) => release(...args),
}))

import {
  abandonAgentRun,
  AGENT_RUN_LEASE_MARGIN_SECONDS,
  agentRunLockMode,
  claimAgentRun,
  trackAgentRun,
} from '@taia/core/services/agent-run-lease.service'

const running = {
  agentId: 'a',
  leaseId: 'old',
  sessionKey: 'sess-live',
  runId: 'run-live',
  expiresAt: new Date(),
}
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

describe('agentRunLockMode', () => {
  it('defaults to shadow and reads enforce and off', () => {
    expect(agentRunLockMode({})).toBe('shadow')
    expect(agentRunLockMode({ TAIA_AGENT_RUN_LOCK: ' Enforce ' })).toBe('enforce')
    expect(agentRunLockMode({ TAIA_AGENT_RUN_LOCK: 'off' })).toBe('off')
    expect(agentRunLockMode({ TAIA_AGENT_RUN_LOCK: 'whatever' })).toBe('shadow')
  })
})

describe('claimAgentRun', () => {
  it('takes the lease for the run timeout plus the margin', async () => {
    acquire.mockResolvedValue({ acquired: true, lease: running })

    const claim = await claimAgentRun('a', { runTimeoutSeconds: 300, force: true, mode: 'enforce' })

    expect(claim).toEqual({ start: true, leaseId: expect.any(String) })
    expect(acquire).toHaveBeenCalledWith(
      'a',
      expect.any(String),
      300 + AGENT_RUN_LEASE_MARGIN_SECONDS,
      true,
    )
  })

  it('enforce: joins the running session', async () => {
    acquire.mockResolvedValue({ acquired: false, lease: running })

    expect(await claimAgentRun('a', { runTimeoutSeconds: 300, mode: 'enforce' })).toEqual({
      start: false,
      running,
    })
  })

  it('shadow: logs what it would coalesce and starts anyway, without the lease', async () => {
    acquire.mockResolvedValue({ acquired: false, lease: running })

    expect(await claimAgentRun('a', { runTimeoutSeconds: 300, mode: 'shadow' })).toEqual({
      start: true,
      leaseId: null,
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('would coalesce'))
  })

  it('off: never touches the database', async () => {
    expect(await claimAgentRun('a', { runTimeoutSeconds: 300, mode: 'off' })).toEqual({
      start: true,
      leaseId: null,
    })
    expect(acquire).not.toHaveBeenCalled()
  })

  it('a database error starts the run without a lease', async () => {
    acquire.mockRejectedValue(new Error('db down'))

    expect(await claimAgentRun('a', { runTimeoutSeconds: 300, mode: 'enforce' })).toEqual({
      start: true,
      leaseId: null,
    })
  })

  it('a lease that vanished is not in the way', async () => {
    acquire.mockResolvedValue({ acquired: false, lease: null })

    expect(await claimAgentRun('a', { runTimeoutSeconds: 300, mode: 'enforce' })).toEqual({
      start: true,
      leaseId: null,
    })
  })
})

describe('trackAgentRun', () => {
  it('records the session and releases the lease when the run ends, even if waiting fails', async () => {
    await trackAgentRun('a', 'l1', { sessionKey: 's', runId: 'r' }, () =>
      Promise.reject(new Error('timeout')),
    )
    await vi.waitFor(() => expect(release).toHaveBeenCalledWith('a', 'l1'))
    expect(attach).toHaveBeenCalledWith('a', 'l1', 's', 'r')
  })

  it('leaves the lease to expire when the end cannot be awaited', async () => {
    await trackAgentRun('a', 'l1', { sessionKey: 's', runId: 'r' })
    expect(release).not.toHaveBeenCalled()
  })

  it('never throws', async () => {
    attach.mockRejectedValueOnce(new Error('db down'))
    release.mockRejectedValueOnce(new Error('db down'))
    await expect(
      trackAgentRun('a', 'l1', { sessionKey: 's', runId: 'r' }, () => Promise.resolve()),
    ).resolves.toBeUndefined()
    release.mockRejectedValueOnce(new Error('db down'))
    await expect(abandonAgentRun('a', 'l1')).resolves.toBeUndefined()
  })
})
