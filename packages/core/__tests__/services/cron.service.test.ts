import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCronForAgent,
  createCron,
  updateCron,
  removeCron,
  triggerCronRun,
  getCronHistory,
} from '@taia/core/services/cron.service'
import { NotFoundError } from '@taia/core/errors'

const mockListCrons = vi.fn()
const mockCronAction = vi.fn()

const mockAdapterForAgent = vi.fn()

vi.mock('@taia/core/runtime', () => ({
  getRuntimeAdapterForAgent: (...args: unknown[]) => {
    mockAdapterForAgent(...args)
    return Promise.resolve({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      listCrons: mockListCrons,
      cronAction: mockCronAction,
    })
  },
}))

vi.mock('@taia/core/db', () => ({
  getSetting: vi.fn(() => Promise.resolve(null)),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const mockJob = {
  id: 'cron-123',
  agentId: 'agent-1',
  enabled: true,
  schedule: { kind: 'cron', expr: '0 */6 * * *', tz: 'UTC' },
  state: {
    nextRunAtMs: 1700000000000,
    lastRunAtMs: 1699990000000,
    lastStatus: 'ok',
    lastError: null,
    lastDurationMs: 5000,
  },
}

// ─── getCronForAgent ───────────────────────────────────────────

describe('getCronForAgent', () => {
  it('returns formatted cron data when found', async () => {
    mockListCrons.mockResolvedValue([mockJob])

    const result = await getCronForAgent('agent-1')

    expect(result).toEqual({
      agentId: 'agent-1',
      cronId: 'cron-123',
      enabled: true,
      schedule: '0 */6 * * *',
      tz: 'UTC',
      nextRun: new Date(1700000000000).toISOString(),
      lastRun: new Date(1699990000000).toISOString(),
      lastStatus: 'ok',
      lastError: null,
      lastDurationMs: 5000,
    })
  })

  it('uses default timezone when job has no tz', async () => {
    const jobNoTz = {
      ...mockJob,
      schedule: { kind: 'cron', expr: '0 9 * * 1' },
    }
    mockListCrons.mockResolvedValue([jobNoTz])

    const result = await getCronForAgent('agent-1')

    expect(result.tz).toBe('UTC')
  })

  it('handles null state fields gracefully', async () => {
    const jobNullState = {
      ...mockJob,
      state: {
        nextRunAtMs: null,
        lastRunAtMs: null,
        lastStatus: null,
        lastError: null,
        lastDurationMs: null,
      },
    }
    mockListCrons.mockResolvedValue([jobNullState])

    const result = await getCronForAgent('agent-1')

    expect(result.nextRun).toBeNull()
    expect(result.lastRun).toBeNull()
    expect(result.lastStatus).toBeNull()
    expect(result.lastError).toBeNull()
    expect(result.lastDurationMs).toBeNull()
  })

  it('throws NotFoundError when no cron for agent', async () => {
    mockListCrons.mockResolvedValue([])

    await expect(getCronForAgent('nonexistent')).rejects.toThrow(NotFoundError)
    await expect(getCronForAgent('nonexistent')).rejects.toThrow("Cron job 'nonexistent' not found")
  })

  it('finds the correct job among multiple crons', async () => {
    const otherJob = { ...mockJob, id: 'cron-999', agentId: 'agent-2' }
    mockListCrons.mockResolvedValue([otherJob, mockJob])

    const result = await getCronForAgent('agent-1')

    expect(result.cronId).toBe('cron-123')
    expect(result.agentId).toBe('agent-1')
  })

  it("skips the runtime's own jobs for the agent", async () => {
    const runtimeHeartbeat = { ...mockJob, id: 'runtime-hb', managedByRuntime: true }
    mockListCrons.mockResolvedValue([runtimeHeartbeat, mockJob])

    expect((await getCronForAgent('agent-1')).cronId).toBe('cron-123')

    mockListCrons.mockResolvedValue([runtimeHeartbeat])
    await expect(getCronForAgent('agent-1')).rejects.toThrow(NotFoundError)
  })
})

// ─── createCron ────────────────────────────────────────────────

describe('createCron', () => {
  it('calls cronAction("add") with correct params including timezone', async () => {
    mockCronAction.mockResolvedValue({ id: 'cron-new' })

    const result = await createCron({
      agentId: 'agent-1',
      schedule: '0 */6 * * *',
    })

    expect(mockCronAction).toHaveBeenCalledWith('add', {
      agentId: 'agent-1',
      schedule: {
        kind: 'cron',
        expr: '0 */6 * * *',
        tz: 'UTC',
      },
      enabled: true,
    })
    expect(result).toEqual({ id: 'cron-new' })
  })

  it('passes enabled=false when explicitly set', async () => {
    mockCronAction.mockResolvedValue({ id: 'cron-disabled' })

    await createCron({
      agentId: 'agent-1',
      schedule: '0 9 * * 1',
      enabled: false,
    })

    expect(mockCronAction).toHaveBeenCalledWith('add', expect.objectContaining({ enabled: false }))
  })

  it('includes timeoutSeconds in payload when provided', async () => {
    mockCronAction.mockResolvedValue({ id: 'cron-timeout' })

    await createCron({
      agentId: 'agent-1',
      schedule: '0 */6 * * *',
      timeoutSeconds: 600,
    })

    expect(mockCronAction).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({
        payload: { timeoutSeconds: 600 },
      }),
    )
  })

  it('does not include payload when timeoutSeconds is not provided', async () => {
    mockCronAction.mockResolvedValue({ id: 'cron-no-timeout' })

    await createCron({
      agentId: 'agent-1',
      schedule: '0 */6 * * *',
    })

    const callParams = mockCronAction.mock.calls[0][1]
    expect(callParams).not.toHaveProperty('payload')
  })
})

// ─── updateCron ────────────────────────────────────────────────

describe('updateCron', () => {
  it('finds job and calls cronAction("update") with schedule', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    const result = await updateCron('agent-1', { schedule: '0 9 * * 1' })

    expect(mockCronAction).toHaveBeenCalledWith('update', {
      id: 'cron-123',
      schedule: {
        kind: 'cron',
        expr: '0 9 * * 1',
        tz: 'UTC',
      },
    })
    expect(result).toEqual({
      agentId: 'agent-1',
      cronId: 'cron-123',
      enabled: true,
      schedule: '0 9 * * 1',
    })
  })

  it('sends enabled flag when updating', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    const result = await updateCron('agent-1', { enabled: false })

    expect(mockCronAction).toHaveBeenCalledWith('update', {
      id: 'cron-123',
      enabled: false,
    })
    expect(result.enabled).toBe(false)
  })

  it('sends timeoutSeconds in payload when provided', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    await updateCron('agent-1', { timeoutSeconds: 300 })

    expect(mockCronAction).toHaveBeenCalledWith(
      'update',
      expect.objectContaining({
        payload: { timeoutSeconds: 300 },
      }),
    )
  })

  it('falls back to job schedule when no new schedule provided', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    const result = await updateCron('agent-1', { enabled: true })

    expect(result.schedule).toBe('0 */6 * * *')
  })

  it('falls back to job enabled when not specified in input', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    const result = await updateCron('agent-1', { schedule: '0 12 * * *' })

    expect(result.enabled).toBe(true)
  })

  it('throws NotFoundError when no cron for agent', async () => {
    mockListCrons.mockResolvedValue([])

    await expect(updateCron('nonexistent', { enabled: false })).rejects.toThrow(NotFoundError)
  })
})

// ─── removeCron ────────────────────────────────────────────────

describe('removeCron', () => {
  it('finds job and calls cronAction("remove") with job id', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    const result = await removeCron('agent-1')

    expect(mockCronAction).toHaveBeenCalledWith('remove', { id: 'cron-123' })
    expect(result).toEqual({
      agentId: 'agent-1',
      cronId: 'cron-123',
      removed: true,
    })
  })

  it('throws NotFoundError when no cron for agent', async () => {
    mockListCrons.mockResolvedValue([])

    await expect(removeCron('nonexistent')).rejects.toThrow(NotFoundError)
  })
})

// ─── triggerCronRun ────────────────────────────────────────────

describe('triggerCronRun', () => {
  it('finds job and calls cronAction("run") with job id', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue({ started: true })

    const result = await triggerCronRun('agent-1')

    expect(mockCronAction).toHaveBeenCalledWith('run', { id: 'cron-123' })
    expect(result).toEqual({
      agentId: 'agent-1',
      cronId: 'cron-123',
      triggered: true,
      result: { started: true },
    })
  })

  it('throws NotFoundError when no cron for agent', async () => {
    mockListCrons.mockResolvedValue([])

    await expect(triggerCronRun('nonexistent')).rejects.toThrow(NotFoundError)
  })
})

// ─── getCronHistory ────────────────────────────────────────────

describe('getCronHistory', () => {
  it('finds job and calls cronAction("runs") with job id', async () => {
    const mockRuns = [
      { runId: 'r-1', startedAt: 1700000000000, status: 'ok' },
      { runId: 'r-2', startedAt: 1699990000000, status: 'error' },
    ]
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue({ runs: mockRuns })

    const result = await getCronHistory('agent-1')

    expect(mockCronAction).toHaveBeenCalledWith('runs', { id: 'cron-123' })
    expect(result).toEqual({
      agentId: 'agent-1',
      cronId: 'cron-123',
      runs: mockRuns,
    })
  })

  it('returns empty runs array when gateway returns no runs', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue({})

    const result = await getCronHistory('agent-1')

    expect(result.runs).toEqual([])
  })

  it('returns empty runs array when gateway returns undefined', async () => {
    mockListCrons.mockResolvedValue([mockJob])
    mockCronAction.mockResolvedValue(undefined)

    const result = await getCronHistory('agent-1')

    expect(result.runs).toEqual([])
  })

  it('throws NotFoundError when no cron for agent', async () => {
    mockListCrons.mockResolvedValue([])

    await expect(getCronHistory('nonexistent')).rejects.toThrow(NotFoundError)
  })
})
