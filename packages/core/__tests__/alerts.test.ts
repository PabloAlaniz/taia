import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RuntimeCapability } from '@taia/runtime'
import { checkAndAlert, generateDailySummary, sendAlert } from '@taia/core/alerts'
import { Task } from '@taia/types'
import { stagesByWorkspace } from '@taia/core/services/task-stage'

const mockGetSetting = vi.fn()
const mockSendChannelMessage = vi.fn()
const mockAdapter = {
  id: 'openclaw',
  capabilities: { has: (cap: string) => cap === RuntimeCapability.Messaging },
  sendChannelMessage: (...args: unknown[]) => mockSendChannelMessage(...args),
}

vi.mock('@taia/core/runtime', () => ({
  getDefaultRuntimeAdapter: vi.fn(() => Promise.resolve(mockAdapter)),
}))

vi.mock('@taia/core/db', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSetting.mockImplementation(async (key: string) =>
    key === 'telegram_target' ? 'TestUser' : null,
  )
  mockSendChannelMessage.mockResolvedValue(undefined)
  mockAdapter.capabilities.has = (cap: string) => cap === RuntimeCapability.Messaging
})

describe('sendAlert', () => {
  it('delivers through the runtime messaging capability', async () => {
    await expect(sendAlert('Test alert')).resolves.toBe(true)
    expect(mockSendChannelMessage).toHaveBeenCalledWith({
      channel: 'telegram',
      target: 'TestUser',
      text: 'Test alert',
    })
  })

  it('uses the configured channel', async () => {
    mockGetSetting.mockImplementation(
      async (key: string) => ({ telegram_target: 'u', 'alerts.channel': 'slack' })[key] ?? null,
    )
    await sendAlert('x')
    expect(mockSendChannelMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'slack' }),
    )
  })

  it('returns false when the runtime cannot deliver messages', async () => {
    mockAdapter.capabilities.has = () => false
    await expect(sendAlert('x')).resolves.toBe(false)
    expect(mockSendChannelMessage).not.toHaveBeenCalled()
  })

  it('returns false without a target', async () => {
    mockGetSetting.mockResolvedValue(null)
    await expect(sendAlert('x')).resolves.toBe(false)
  })

  it('returns false on delivery error', async () => {
    mockSendChannelMessage.mockRejectedValue(new Error('Network error'))
    await expect(sendAlert('Test')).resolves.toBe(false)
  })
})

describe('checkAndAlert', () => {
  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()

  it('detects tasks in REVIEW for too long', async () => {
    const tasks: Task[] = [
      { id: '1', title: 'Review me', status: 'REVIEW', updated_at: twoHoursAgo } as Task,
    ]

    const alerts = await checkAndAlert(tasks)
    expect(alerts.some((a) => a.includes('waiting for review'))).toBe(true)
  })

  it('detects blocked tasks', async () => {
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Blocked task',
        status: 'IN_PROGRESS',
        tags: ['blocked'],
        updated_at: threeDaysAgo,
      } as Task,
    ]

    const alerts = await checkAndAlert(tasks)
    expect(alerts.some((a) => a.includes('blocked'))).toBe(true)
  })

  it('detects stale ASSIGNED tasks', async () => {
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Stale task',
        status: 'ASSIGNED',
        assigned_to: 'agent-1',
        updated_at: threeDaysAgo,
      } as Task,
    ]

    const alerts = await checkAndAlert(tasks)
    expect(alerts.some((a) => a.includes('stale'))).toBe(true)
  })

  it('returns empty array when no issues', async () => {
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Active task',
        status: 'IN_PROGRESS',
        updated_at: new Date().toISOString(),
      } as Task,
    ]

    const alerts = await checkAndAlert(tasks)
    expect(alerts).toHaveLength(0)
  })
})

describe('generateDailySummary', () => {
  it('generates summary with stats', () => {
    const today = new Date()
    const tasks: Task[] = [
      { id: '1', title: 'Done task', status: 'DONE', completed_at: today.toISOString() } as Task,
      { id: '2', title: 'In progress', status: 'IN_PROGRESS' } as Task,
      { id: '3', title: 'Review task', status: 'REVIEW' } as Task,
      { id: '4', title: 'Inbox task', status: 'INBOX' } as Task,
    ]

    const summary = generateDailySummary(tasks, [])

    expect(summary).toContain('Resumen Diario')
    expect(summary).toContain('Completed today: 1')
    expect(summary).toContain('In progress: 1')
    expect(summary).toContain('Waiting review: 1')
    expect(summary).toContain('Inbox: 1')
  })

  it('includes completed task titles', () => {
    const today = new Date()
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Finished Feature X',
        status: 'DONE',
        completed_at: today.toISOString(),
      } as Task,
    ]

    const summary = generateDailySummary(tasks, [])
    expect(summary).toContain('Finished Feature X')
  })

  it('includes tasks needing review', () => {
    const tasks: Task[] = [{ id: '1', title: 'PR for Review', status: 'REVIEW' } as Task]

    const summary = generateDailySummary(tasks, [])
    expect(summary).toContain('Needs review')
    expect(summary).toContain('PR for Review')
  })
})

describe('alerts on a board with its own columns', () => {
  // A sales-style board: nothing here is literally IN_PROGRESS, REVIEW or DONE.
  const stages = stagesByWorkspace([
    { workspace_id: 'ws-sales', slug: 'LEAD', position: 0, is_initial_state: true },
    { workspace_id: 'ws-sales', slug: 'PROPUESTA', position: 1 },
    { workspace_id: 'ws-sales', slug: 'EN_REVISION', position: 2 },
    { workspace_id: 'ws-sales', slug: 'CERRADO_GANADO', position: 3, is_done_state: true },
  ])
  const now = new Date()
  const longAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const task = (id: string, status: string, extra: Partial<Task> = {}) =>
    ({
      id,
      title: `T ${status}`,
      status,
      workspace_id: 'ws-sales',
      updated_at: longAgo,
      ...extra,
    }) as Task

  it('counts by the column, not the status name', () => {
    const summary = generateDailySummary(
      [
        task('1', 'PROPUESTA'),
        task('2', 'EN_REVISION'),
        task('3', 'CERRADO_GANADO', { completed_at: now.toISOString() }),
        task('4', 'LEAD'),
      ],
      [],
      stages,
    )
    expect(summary).toContain('In progress: 1')
    expect(summary).toContain('Waiting review: 1')
    expect(summary).toContain('Completed today: 1')
  })

  it('flags review and stale work by stage', async () => {
    const alerts = await checkAndAlert(
      [task('1', 'EN_REVISION'), task('2', 'LEAD', { assigned_to: 'agent-1' })],
      stages,
    )
    expect(alerts.some((a) => a.includes('waiting for review'))).toBe(true)
    expect(alerts.some((a) => a.includes('stale'))).toBe(true)
  })
})
