import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@taia/core/services/task.service', () => ({
  listTasks: vi.fn(),
}))

vi.mock('../../../../../../packages/core/src/db', () => ({
  getActivities: vi.fn(),
  getSetting: vi.fn(),
  logActivity: vi.fn(),
  // No columns known: the legacy DONE / REJECTED rule applies.
  getColumnStates: vi.fn().mockResolvedValue([]),
}))

import { getUsageAnalytics, usageAnalyticsToCsv } from '@taia/core/services/usage-analytics.service'
import { listTasks } from '@taia/core/services/task.service'
import { getActivities, getSetting, logActivity } from '../../../../../../packages/core/src/db'

beforeEach(() => vi.clearAllMocks())

describe('usage analytics service', () => {
  it('calculates throughput, aging and time by status for a workspace/date range', async () => {
    vi.mocked(listTasks).mockResolvedValue({
      total: 3,
      tasks: [
        {
          id: 'done-1',
          title: 'Done task',
          status: 'DONE',
          priority: 'MEDIUM',
          created_at: '2026-09-01T10:00:00.000Z',
          updated_at: '2026-09-02T10:00:00.000Z',
          completed_at: '2026-09-02T10:00:00.000Z',
          time_spent_minutes: 30,
          assigned_to: 'agent-1',
        },
        {
          id: 'active-1',
          title: 'Active task',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-03T00:00:00.000Z',
          time_spent_minutes: 15,
          assigned_to: 'agent-2',
        },
        {
          id: 'old-1',
          title: 'Outside range',
          status: 'DONE',
          priority: 'LOW',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
          completed_at: '2026-08-02T00:00:00.000Z',
          time_spent_minutes: 99,
        },
      ] as any,
    })

    const metrics = await getUsageAnalytics({
      workspace_id: 'ws-1',
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-03T00:00:00.000Z',
    })

    expect(listTasks).toHaveBeenCalledWith({ workspace_id: 'ws-1' })
    expect(metrics.totals.tasks_in_scope).toBe(2)
    expect(metrics.throughput.completed_count).toBe(1)
    expect(metrics.throughput.by_day).toEqual([{ date: '2026-09-02', count: 1 }])
    expect(metrics.aging.average_age_days).toBe(2)
    expect(metrics.sla).toMatchObject({ evaluated: false, persisted: false, alerts: [] })
    expect(metrics.time_by_column).toEqual([
      { status: 'DONE', count: 1, total_minutes: 30, average_minutes: 30 },
      { status: 'IN_PROGRESS', count: 1, total_minutes: 15, average_minutes: 15 },
    ])
  })

  it('evaluates workspace SLA alerts and dedupes persisted activities', async () => {
    vi.mocked(getSetting).mockResolvedValue(
      JSON.stringify({
        max_active_age_days: 2,
        min_completed_per_period: 1,
        column_count_limits: { IN_PROGRESS: 1 },
        cooldown_hours: 24,
      }),
    )
    vi.mocked(getActivities).mockResolvedValue([
      {
        id: 'activity-existing',
        type: 'alert',
        agent_id: 'usage-analytics',
        message: 'previous',
        metadata: {
          source: 'usage-analytics-sla',
          fingerprint: 'usage-analytics-sla:ws-1:throughput_drop',
        },
        created_at: '2026-09-03T12:00:00.000Z',
      } as any,
    ])
    vi.mocked(logActivity).mockResolvedValue({ id: 'activity-new' } as any)
    vi.mocked(listTasks).mockResolvedValue({
      total: 2,
      tasks: [
        {
          id: 'active-old',
          title: 'Old active task',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'active-new',
          title: 'New active task',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          created_at: '2026-09-03T00:00:00.000Z',
          updated_at: '2026-09-03T00:00:00.000Z',
        },
      ] as any,
    })

    const metrics = await getUsageAnalytics({
      workspace_id: 'ws-1',
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-04T00:00:00.000Z',
      evaluate_sla: true,
      persist_alerts: true,
      now: '2026-09-04T00:00:00.000Z',
    })

    expect(getActivities).toHaveBeenCalledWith(200, 'ws-1')
    expect(logActivity).toHaveBeenCalledTimes(2)
    expect(metrics.sla.alerts.map((alert) => alert.rule).sort()).toEqual([
      'active_age',
      'column_accumulation',
      'throughput_drop',
    ])
    expect(metrics.sla.alerts.find((alert) => alert.rule === 'throughput_drop')).toMatchObject({
      deduped: true,
      activity_id: 'activity-existing',
    })
  })

  it('serializes metrics to automation-friendly CSV', async () => {
    const csv = usageAnalyticsToCsv({
      generated_at: '2026-09-03T00:00:00.000Z',
      filters: { workspace_id: 'ws-1', start: null, end: null },
      totals: { tasks_in_scope: 1, completed: 1, active: 0, rejected: 0 },
      throughput: {
        completed_count: 1,
        by_day: [{ date: '2026-09-02', count: 1 }],
        by_agent: [{ agent: 'agent-1', count: 1 }],
      },
      aging: { average_age_days: 0, p95_age_days: 0, oldest: [] },
      time_by_column: [{ status: 'DONE', count: 1, total_minutes: 30, average_minutes: 30 }],
      sla: {
        evaluated: false,
        persisted: false,
        config: {
          max_active_age_days: 7,
          min_completed_per_period: 1,
          column_count_limits: {},
          cooldown_hours: 24,
        },
        alerts: [],
      },
    })

    expect(csv).toContain('throughput_by_day,2026-09-02,,1,,')
    expect(csv).toContain('time_by_column,DONE,,1,30,30')
  })
})
