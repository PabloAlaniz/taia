import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/services/usage-analytics.service', () => ({
  getUsageAnalytics: vi.fn(),
  usageAnalyticsToCsv: vi.fn(() => 'section,key,value\ntotals,tasks_in_scope,2'),
}))

import { GET } from '@/app/api/usage-analytics/route'
import * as usageAnalyticsService from '@taia/core/services/usage-analytics.service'

beforeEach(() => vi.clearAllMocks())

const mockMetrics = {
  generated_at: '2026-09-03T00:00:00.000Z',
  filters: { workspace_id: 'ws-1', start: '2026-09-01T00:00:00.000Z', end: null },
  totals: { tasks_in_scope: 2, completed: 1, active: 1, rejected: 0 },
  throughput: {
    completed_count: 1,
    by_day: [{ date: '2026-09-02', count: 1 }],
    by_agent: [{ agent: 'agent-1', count: 1 }],
  },
  aging: { average_age_days: 2, p95_age_days: 2, oldest: [] },
  time_by_column: [{ status: 'DONE', count: 1, total_minutes: 45, average_minutes: 45 }],
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
}

describe('GET /api/usage-analytics', () => {
  it('passes workspace/date filters and returns JSON metrics', async () => {
    vi.mocked(usageAnalyticsService.getUsageAnalytics).mockResolvedValue(mockMetrics)

    const req = new NextRequest(
      'http://localhost/api/usage-analytics?workspace_id=ws-1&start=2026-09-01T00:00:00.000Z',
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(usageAnalyticsService.getUsageAnalytics).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      start: '2026-09-01T00:00:00.000Z',
      end: undefined,
      evaluate_sla: false,
      persist_alerts: false,
    })
    expect(data.ok).toBe(true)
    expect(data.metrics.throughput.completed_count).toBe(1)
  })

  it('passes SLA evaluation and persistence flags for cron usage', async () => {
    vi.mocked(usageAnalyticsService.getUsageAnalytics).mockResolvedValue(mockMetrics)

    const req = new NextRequest(
      'http://localhost/api/usage-analytics?workspace_id=ws-1&sla=true&persist_alerts=true',
    )
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(usageAnalyticsService.getUsageAnalytics).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      start: undefined,
      end: undefined,
      evaluate_sla: true,
      persist_alerts: true,
    })
  })

  it('exports CSV metrics', async () => {
    vi.mocked(usageAnalyticsService.getUsageAnalytics).mockResolvedValue(mockMetrics)

    const req = new NextRequest('http://localhost/api/usage-analytics?workspace_id=ws-1&format=csv')
    const res = await GET(req)
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(text).toContain('totals,tasks_in_scope,2')
  })

  it('rejects unsupported export formats', async () => {
    const req = new NextRequest('http://localhost/api/usage-analytics?format=xlsx')
    const res = await GET(req)

    expect(res.status).toBe(400)
  })
})
