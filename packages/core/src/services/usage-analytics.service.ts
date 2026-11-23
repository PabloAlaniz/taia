import type { Task } from '@taia/types'
import { getActivities, getSetting, logActivity } from '../db'
import { listTasks } from './task.service'
import { type ColumnStates, isCompleted, isFinished, loadColumnStates } from './task-outcome'

export interface UsageAnalyticsFilters {
  workspace_id?: string
  start?: string
  end?: string
  evaluate_sla?: boolean
  persist_alerts?: boolean
  now?: string
}

export interface UsageAnalyticsSlaConfig {
  max_active_age_days: number
  min_completed_per_period: number
  column_count_limits: Record<string, number>
  cooldown_hours: number
}

export interface UsageAnalyticsSlaAlert {
  rule: 'active_age' | 'throughput_drop' | 'column_accumulation'
  severity: 'warning' | 'critical'
  fingerprint: string
  message: string
  current: number
  threshold: number
  status?: string
  task_id?: string
  task_title?: string
  age_days?: number
  deduped?: boolean
  activity_id?: string
}

export interface UsageAnalyticsMetrics {
  generated_at: string
  filters: {
    workspace_id: string | null
    start: string | null
    end: string | null
  }
  totals: {
    tasks_in_scope: number
    completed: number
    active: number
    rejected: number
  }
  throughput: {
    completed_count: number
    by_day: { date: string; count: number }[]
    by_agent: { agent: string; count: number }[]
  }
  aging: {
    average_age_days: number
    p95_age_days: number
    oldest: { id: string; title: string; status: string; age_days: number }[]
  }
  time_by_column: {
    status: string
    count: number
    total_minutes: number
    average_minutes: number
  }[]
  sla: {
    evaluated: boolean
    persisted: boolean
    config: UsageAnalyticsSlaConfig
    alerts: UsageAnalyticsSlaAlert[]
  }
}

const DEFAULT_SLA_CONFIG: UsageAnalyticsSlaConfig = {
  max_active_age_days: 7,
  min_completed_per_period: 1,
  column_count_limits: {
    INBOX: 10,
    ASSIGNED: 10,
    IN_PROGRESS: 5,
    REVIEW: 5,
  },
  cooldown_hours: 24,
}

function parseSlaConfig(raw: string | null): UsageAnalyticsSlaConfig {
  if (!raw) return DEFAULT_SLA_CONFIG
  try {
    const parsed = JSON.parse(raw) as Partial<UsageAnalyticsSlaConfig>
    return {
      max_active_age_days: Number(
        parsed.max_active_age_days ?? DEFAULT_SLA_CONFIG.max_active_age_days,
      ),
      min_completed_per_period: Number(
        parsed.min_completed_per_period ?? DEFAULT_SLA_CONFIG.min_completed_per_period,
      ),
      column_count_limits: {
        ...DEFAULT_SLA_CONFIG.column_count_limits,
        ...(parsed.column_count_limits ?? {}),
      },
      cooldown_hours: Number(parsed.cooldown_hours ?? DEFAULT_SLA_CONFIG.cooldown_hours),
    }
  } catch {
    return DEFAULT_SLA_CONFIG
  }
}

function parseBoundary(value: string | undefined, boundary: 'start' | 'end' | 'now'): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${boundary} date: ${value}`)
  }
  return date
}

function completedInRange(
  task: Task,
  start: Date | null,
  end: Date | null,
  states: ColumnStates,
): boolean {
  if (!isCompleted(task, states) || !task.completed_at) return false
  const completedAt = new Date(task.completed_at)
  return (!start || completedAt >= start) && (!end || completedAt <= end)
}

function overlapsRange(task: Task, start: Date | null, end: Date | null): boolean {
  const createdAt = new Date(task.created_at)
  const completedAt = task.completed_at ? new Date(task.completed_at) : null

  if (end && createdAt > end) return false
  if (start && completedAt && completedAt < start) return false
  return true
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

async function getWorkspaceSlaConfig(workspaceId?: string): Promise<UsageAnalyticsSlaConfig> {
  const workspaceKey = workspaceId ? `usage_analytics_sla:${workspaceId}` : null
  const raw = workspaceKey ? await getSetting(workspaceKey) : null
  return parseSlaConfig(raw ?? (await getSetting('usage_analytics_sla:default')))
}

function buildSlaAlerts(params: {
  workspaceId?: string
  config: UsageAnalyticsSlaConfig
  activeAges: { task: Task; ageDays: number }[]
  completedCount: number
  timeByColumn: UsageAnalyticsMetrics['time_by_column']
}): UsageAnalyticsSlaAlert[] {
  const alerts: UsageAnalyticsSlaAlert[] = []
  const workspacePart = params.workspaceId ?? 'all-workspaces'

  for (const { task, ageDays } of params.activeAges) {
    if (ageDays < params.config.max_active_age_days) continue
    alerts.push({
      rule: 'active_age',
      severity: ageDays >= params.config.max_active_age_days * 2 ? 'critical' : 'warning',
      fingerprint: `usage-analytics-sla:${workspacePart}:active_age:${task.id}`,
      message: `Task ${task.id} has aged ${ageDays}d in ${task.status}`,
      current: ageDays,
      threshold: params.config.max_active_age_days,
      status: task.status,
      task_id: task.id,
      task_title: task.title,
      age_days: ageDays,
    })
  }

  if (params.completedCount < params.config.min_completed_per_period) {
    alerts.push({
      rule: 'throughput_drop',
      severity: 'warning',
      fingerprint: `usage-analytics-sla:${workspacePart}:throughput_drop`,
      message: `Throughput below SLA: ${params.completedCount} completed task(s) in range`,
      current: params.completedCount,
      threshold: params.config.min_completed_per_period,
    })
  }

  for (const column of params.timeByColumn) {
    const limit = params.config.column_count_limits[column.status]
    if (!limit || column.count <= limit) continue
    alerts.push({
      rule: 'column_accumulation',
      severity: column.count >= limit * 2 ? 'critical' : 'warning',
      fingerprint: `usage-analytics-sla:${workspacePart}:column_accumulation:${column.status}`,
      message: `Column ${column.status} has ${column.count} task(s), above SLA limit ${limit}`,
      current: column.count,
      threshold: limit,
      status: column.status,
    })
  }

  return alerts
}

async function persistSlaAlerts(params: {
  workspaceId?: string
  alerts: UsageAnalyticsSlaAlert[]
  config: UsageAnalyticsSlaConfig
  now: Date
}): Promise<UsageAnalyticsSlaAlert[]> {
  if (params.alerts.length === 0) return []

  const recentActivities = await getActivities(200, params.workspaceId)
  const cooldownMs = params.config.cooldown_hours * 3_600_000

  return Promise.all(
    params.alerts.map(async (alert) => {
      const previous = recentActivities.find((activity) => {
        const metadata = activity.metadata as Record<string, unknown> | undefined
        if (metadata?.source !== 'usage-analytics-sla') return false
        if (metadata?.fingerprint !== alert.fingerprint) return false
        return params.now.getTime() - new Date(activity.created_at).getTime() < cooldownMs
      })

      if (previous) {
        return { ...alert, deduped: true, activity_id: previous.id }
      }

      const activity = await logActivity({
        type: 'alert',
        agent_id: 'usage-analytics',
        task_id: alert.task_id,
        workspace_id: params.workspaceId,
        message: alert.message,
        metadata: {
          source: 'usage-analytics-sla',
          fingerprint: alert.fingerprint,
          rule: alert.rule,
          severity: alert.severity,
          current: alert.current,
          threshold: alert.threshold,
        },
      })

      return { ...alert, deduped: false, activity_id: activity.id }
    }),
  )
}

export async function getUsageAnalytics(
  filters: UsageAnalyticsFilters = {},
): Promise<UsageAnalyticsMetrics> {
  const start = parseBoundary(filters.start, 'start')
  const end = parseBoundary(filters.end, 'end')
  const now = filters.now ? parseBoundary(filters.now, 'now')! : new Date()
  if (start && end && start > end) {
    throw new Error('Invalid date range: start must be before end')
  }

  const [{ tasks: allTasks }, states] = await Promise.all([
    listTasks({ workspace_id: filters.workspace_id }),
    loadColumnStates(filters.workspace_id),
  ])
  const tasks = allTasks.filter((task) => overlapsRange(task, start, end))
  const completed = tasks.filter((task) => completedInRange(task, start, end, states))
  const active = tasks.filter((task) => !isFinished(task, states))
  const nowOrEnd = end ?? now

  const byDay = new Map<string, number>()
  const byAgent = new Map<string, number>()
  for (const task of completed) {
    const date = new Date(task.completed_at!).toISOString().slice(0, 10)
    byDay.set(date, (byDay.get(date) ?? 0) + 1)
    const agent = task.assigned_to || 'unassigned'
    byAgent.set(agent, (byAgent.get(agent) ?? 0) + 1)
  }

  const activeAges = active.map((task) => {
    const ageDays = Math.max(
      0,
      (nowOrEnd.getTime() - new Date(task.created_at).getTime()) / 86_400_000,
    )
    return { task, ageDays: round(ageDays) }
  })
  const ageValues = activeAges.map(({ ageDays }) => ageDays)

  const byStatus = new Map<string, { count: number; total: number }>()
  for (const task of tasks) {
    const current = byStatus.get(task.status) ?? { count: 0, total: 0 }
    current.count += 1
    current.total += task.time_spent_minutes || 0
    byStatus.set(task.status, current)
  }

  const timeByColumn = Array.from(byStatus.entries())
    .map(([status, value]) => ({
      status,
      count: value.count,
      total_minutes: value.total,
      average_minutes: value.count > 0 ? round(value.total / value.count) : 0,
    }))
    .sort((a, b) => a.status.localeCompare(b.status))

  const slaConfig = await getWorkspaceSlaConfig(filters.workspace_id)
  const slaAlerts = filters.evaluate_sla
    ? buildSlaAlerts({
        workspaceId: filters.workspace_id,
        config: slaConfig,
        activeAges,
        completedCount: completed.length,
        timeByColumn,
      })
    : []
  const persistedAlerts =
    filters.evaluate_sla && filters.persist_alerts
      ? await persistSlaAlerts({
          workspaceId: filters.workspace_id,
          alerts: slaAlerts,
          config: slaConfig,
          now,
        })
      : slaAlerts

  return {
    generated_at: now.toISOString(),
    filters: {
      workspace_id: filters.workspace_id ?? null,
      start: start?.toISOString() ?? null,
      end: end?.toISOString() ?? null,
    },
    totals: {
      tasks_in_scope: tasks.length,
      completed: completed.length,
      active: active.length,
      rejected: tasks.filter((task) => task.status === 'REJECTED').length,
    },
    throughput: {
      completed_count: completed.length,
      by_day: Array.from(byDay.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      by_agent: Array.from(byAgent.entries())
        .map(([agent, count]) => ({ agent, count }))
        .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent)),
    },
    aging: {
      average_age_days: ageValues.length
        ? round(ageValues.reduce((sum, age) => sum + age, 0) / ageValues.length)
        : 0,
      p95_age_days: percentile(ageValues, 95),
      oldest: activeAges
        .sort((a, b) => b.ageDays - a.ageDays)
        .slice(0, 10)
        .map(({ task, ageDays }) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          age_days: ageDays,
        })),
    },
    time_by_column: timeByColumn,
    sla: {
      evaluated: Boolean(filters.evaluate_sla),
      persisted: Boolean(filters.evaluate_sla && filters.persist_alerts),
      config: slaConfig,
      alerts: persistedAlerts,
    },
  }
}

export function usageAnalyticsToCsv(metrics: UsageAnalyticsMetrics): string {
  const rows = [
    ['section', 'key', 'value', 'count', 'total_minutes', 'average_minutes'],
    ['totals', 'tasks_in_scope', metrics.totals.tasks_in_scope, '', '', ''],
    ['totals', 'completed', metrics.totals.completed, '', '', ''],
    ['totals', 'active', metrics.totals.active, '', '', ''],
    ['throughput', 'completed_count', metrics.throughput.completed_count, '', '', ''],
    ...metrics.throughput.by_day.map((row) => [
      'throughput_by_day',
      row.date,
      '',
      row.count,
      '',
      '',
    ]),
    ...metrics.throughput.by_agent.map((row) => [
      'throughput_by_agent',
      row.agent,
      '',
      row.count,
      '',
      '',
    ]),
    ['aging', 'average_age_days', metrics.aging.average_age_days, '', '', ''],
    ['aging', 'p95_age_days', metrics.aging.p95_age_days, '', '', ''],
    ...metrics.time_by_column.map((row) => [
      'time_by_column',
      row.status,
      '',
      row.count,
      row.total_minutes,
      row.average_minutes,
    ]),
  ]

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell)
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        })
        .join(','),
    )
    .join('\n')
}
