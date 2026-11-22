'use client'

import { useState, useMemo } from 'react'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Task, Agent, Activity, CostDashboardMetrics } from '@taia/types'
import { cn } from '../../lib/utils'
import { Button, Select, ProgressBar, ParticipantMark } from '../../components/atoms'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'
import { StatCard } from '@/components/molecules/stat-card'
import { computeDailyCompletions, getAgentColor } from '../../lib/dashboard-utils'
import { useResource } from '@/lib/use-resource'
import { formatTokens } from '@/lib/format'
import { useStore } from '../../lib/store'

type PeriodFilter = '24h' | 'week' | 'month' | 'all'

interface Stats {
  totalTasks: number
  completedToday: number
  completedThisWeek: number
  inProgress: number
  inReview: number
  blocked: number
  avgTimeMinutes: number
  byAgent: {
    agent: Agent
    total: number
    done: number
    pending: number
    timeMinutes: number
  }[]
  byProject: { project: string; count: number; done: number }[]
  staleTasks: Task[]
  recentActivity: Activity[]
  agentSource?: string
}

interface UsageAnalyticsMetrics {
  throughput: { completed_count: number }
  aging: { average_age_days: number; p95_age_days: number }
  time_by_column: {
    status: string
    count: number
    total_minutes: number
    average_minutes: number
  }[]
}

function getPeriodStart(p: PeriodFilter): Date | null {
  const now = new Date()
  switch (p) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    default:
      return null
  }
}

function getUsageAnalyticsParams(
  period: PeriodFilter,
  workspaceId: string | null,
  format: 'json' | 'csv' = 'json',
) {
  const params = new URLSearchParams({ format })
  if (workspaceId) params.set('workspace_id', workspaceId)
  const periodStart = getPeriodStart(period)
  if (periodStart) params.set('start', periodStart.toISOString())
  return params
}

/** Optional metrics: the dashboard still renders when the endpoint is unavailable. */
async function optionalMetrics<T>(res: Response | null): Promise<T | null> {
  if (!res?.ok) return null
  try {
    const data = (await res.json()) as { metrics?: T }
    return data.metrics || null
  } catch {
    return null
  }
}

/** Cost with three decimals under a dollar, where cents alone would read as zero. */
function formatCost(locale: string, usd: number): string {
  const digits = usd < 1 ? 3 : 2
  return `$${usd.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

interface DashboardData {
  stats: Stats
  costMetrics: CostDashboardMetrics | null
  usageMetrics: UsageAnalyticsMetrics | null
  tasks: Task[]
  agents: Agent[]
}

async function loadDashboard(
  period: PeriodFilter,
  workspaceId: string | null,
): Promise<DashboardData> {
  // Tasks and activity of the active workspace; agents and costs are shared.
  const scope = workspaceId ? `workspace_id=${encodeURIComponent(workspaceId)}` : ''
  const [tasksRes, agentsRes, activityRes, costRes, usageRes] = await Promise.all([
    fetch(`/api/tasks${scope ? `?${scope}` : ''}`),
    fetch('/api/agents'),
    fetch(`/api/activities?limit=20${scope ? `&${scope}` : ''}`),
    fetch(`/api/cost/dashboard?period=${period}`).catch(() => null),
    fetch(`/api/usage-analytics?${getUsageAnalyticsParams(period, workspaceId)}`).catch(() => null),
  ])

  const { tasks: allTasks } = (await tasksRes.json()) as { tasks: Task[] }
  const agentsData = (await agentsRes.json()) as {
    agents: Agent[]
    source?: string
  }
  const agents = agentsData.agents
  const agentSource = agentsData.source
  const { activities } = (await activityRes.json()) as {
    activities: Activity[]
  }

  // Apply period filter
  const periodStart = getPeriodStart(period)
  const tasks = periodStart
    ? allTasks.filter((t) => new Date(t.created_at) >= periodStart)
    : allTasks

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  const completedTasks = tasks.filter((t) => t.status === 'DONE')
  const completedToday = completedTasks.filter(
    (t) => t.completed_at && new Date(t.completed_at) >= todayStart,
  ).length
  const completedThisWeek = completedTasks.filter(
    (t) => t.completed_at && new Date(t.completed_at) >= weekStart,
  ).length

  // Time stats
  const tasksWithTime = completedTasks.filter(
    (t) => t.time_spent_minutes && t.time_spent_minutes > 0,
  )
  const avgTimeMinutes =
    tasksWithTime.length > 0
      ? Math.round(
          tasksWithTime.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0) /
            tasksWithTime.length,
        )
      : 0

  // By agent - now with done + pending
  const byAgent = agents
    .filter((a) => a.type !== 'orchestrator')
    .map((agent) => {
      const agentTasks = tasks.filter((t) => t.assigned_to === agent.id)
      const doneTasks = agentTasks.filter((t) => t.status === 'DONE')
      const pendingTasks = agentTasks.filter((t) => t.status !== 'DONE' && t.status !== 'REJECTED')
      const timeMinutes = doneTasks.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0)
      return {
        agent,
        total: agentTasks.length,
        done: doneTasks.length,
        pending: pendingTasks.length,
        timeMinutes,
      }
    })
    .sort((a, b) => b.done - a.done)

  // By project
  const projects = new Set(tasks.map((t) => t.project).filter(Boolean))
  const byProject = Array.from(projects)
    .map((project) => ({
      project: project!,
      count: tasks.filter((t) => t.project === project).length,
      done: tasks.filter((t) => t.project === project && t.status === 'DONE').length,
    }))
    .sort((a, b) => b.count - a.count)

  // Stale tasks (assigned >24h ago, not moving)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const staleTasks = tasks.filter(
    (t) => t.status === 'ASSIGNED' && new Date(t.updated_at) < oneDayAgo,
  )

  const stats: Stats = {
    totalTasks: tasks.length,
    completedToday,
    completedThisWeek,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    inReview: tasks.filter((t) => t.status === 'REVIEW').length,
    blocked: tasks.filter(
      (t) => t.tags?.includes('blocked') || t.tags?.includes('needs-clarification'),
    ).length,
    avgTimeMinutes,
    byAgent,
    byProject,
    staleTasks,
    recentActivity: activities,
    agentSource,
  }

  return {
    stats,
    costMetrics: await optionalMetrics<CostDashboardMetrics>(costRes),
    usageMetrics: await optionalMetrics<UsageAnalyticsMetrics>(usageRes),
    tasks: allTasks,
    agents,
  }
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const tu = useTranslations('dashboardUi')
  const format = useFormatter()
  const locale = useLocale()
  const now = useNow({ updateInterval: 60_000 })
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId)
  // Keeps the previous figures on screen while another period loads.
  const { data, loading, reload } = useResource(
    `${period}:${activeWorkspaceId}`,
    () => loadDashboard(period, activeWorkspaceId),
    { keepPreviousData: true },
  )
  const stats = data?.stats ?? null
  const costMetrics = data?.costMetrics ?? null
  const usageMetrics = data?.usageMetrics ?? null
  const rawTasks = useMemo(() => data?.tasks ?? [], [data])
  const rawAgents = data?.agents ?? []

  const dailyCompletions = useMemo(() => computeDailyCompletions(rawTasks), [rawTasks])

  const chartAgentIds = useMemo(() => {
    const ids = new Set<string>()
    dailyCompletions.forEach((d) => d.byAgent.forEach((a) => ids.add(a.agentId)))
    return Array.from(ids).sort()
  }, [dailyCompletions])

  function formatTime(minutes: number): string {
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  /** YYYY-MM-DD day keys, shown as a short localized date. */
  function formatDay(day: string): string {
    const date = new Date(`${day.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return day
    return format.dateTime(date, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  }

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span role="status" className="text-sm text-muted">
          {tu('loading')}
        </span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center gap-3">
        <span role="alert" className="text-alert">
          {tu('loadFailed')}
        </span>
        <Button variant="secondary" size="sm" onClick={reload}>
          {tu('retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <PageHeader title={t('title')}>
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
          aria-label={tu('period')}
          className="bg-background border border-border rounded-md px-2 py-1 text-xs w-auto"
        >
          <option value="24h">{t('last24h')}</option>
          <option value="week">{t('lastWeek')}</option>
          <option value="month">{t('lastMonth')}</option>
          <option value="all">{t('allTime')}</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={reload}>
          {t('refresh')}
        </Button>
      </PageHeader>

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-6xl mx-auto">
        {/* Overview Cards — hero size for primary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label={t('totalTasks')} value={stats.totalTasks} size="hero" />
          <StatCard label={t('completedToday')} value={stats.completedToday} size="hero" />
          <StatCard label={t('thisWeek')} value={stats.completedThisWeek} size="hero" />
          <StatCard label={t('avgTime')} value={formatTime(stats.avgTimeMinutes)} size="hero" />
        </div>

        {/* Usage Analytics */}
        {usageMetrics && (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-xs font-medium text-muted uppercase tracking-wider">
                {tu('flowSection')}
              </h2>
              <a
                href={`/api/usage-analytics?${getUsageAnalyticsParams(period, activeWorkspaceId, 'csv')}`}
                download="usage-analytics.csv"
                aria-label={tu('exportCsvLabel')}
                className={cn(
                  'rounded-md font-medium transition-colors cursor-pointer',
                  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-hidden',
                  'bg-background border border-border text-foreground hover:bg-card px-2.5 py-1 text-xs',
                )}
              >
                {tu('exportCsv')}
              </a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
              <StatCard label={tu('throughput')} value={usageMetrics.throughput.completed_count} />
              <StatCard
                label={tu('avgAging')}
                value={tu('days', {
                  days: format.number(usageMetrics.aging.average_age_days, {
                    maximumFractionDigits: 1,
                  }),
                })}
              />
              <StatCard
                label={tu('p95Aging')}
                value={tu('days', {
                  days: format.number(usageMetrics.aging.p95_age_days, {
                    maximumFractionDigits: 1,
                  }),
                })}
              />
              <StatCard
                label={tu('trackedTime')}
                value={formatTime(
                  usageMetrics.time_by_column.reduce((sum, row) => sum + row.total_minutes, 0),
                )}
              />
            </div>
            <p className="text-xs text-muted mb-10 max-w-prose">{tu('agingNote')}</p>
          </>
        )}

        {/* Status Overview */}
        <h2 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          {t('statusSection')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label={t('inProgress')} value={stats.inProgress} />
          <StatCard
            label={t('blocked')}
            value={stats.blocked}
            tone={stats.blocked > 0 ? 'alert' : 'default'}
          />
          <StatCard label={t('inReview')} value={stats.inReview} />
          <StatCard
            label={t('stale')}
            value={stats.staleTasks.length}
            tone={stats.staleTasks.length > 0 ? 'waiting' : 'default'}
          />
        </div>

        {/* Cost Overview */}
        {costMetrics && costMetrics.totals.total_tokens > 0 && (
          <>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
              {t('costSection')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label={t('totalCost')}
                value={formatCost(locale, costMetrics.totals.total_cost_usd)}
              />
              <StatCard
                label={t('totalTokens')}
                value={formatTokens(costMetrics.totals.total_tokens)}
              />
              <StatCard label={t('sessionCount')} value={costMetrics.totals.session_count} />
              <StatCard label={t('models')} value={costMetrics.by_model.length} />
            </div>
          </>
        )}

        {/* Daily Completions Stacked Bar Chart */}
        {dailyCompletions.length > 0 && (
          <Card padding="md" className="rounded-lg mb-8">
            <h2 className="text-sm font-medium mb-3">{t('chartTitle')}</h2>
            {chartAgentIds.length > 0 ? (
              <>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {chartAgentIds.map((id) => {
                    const agent = rawAgents.find((a) => a.id === id)
                    return (
                      <span key={id} className="flex items-center gap-1 text-xs text-muted">
                        <span
                          className={cn('w-3 h-3 rounded-xs', getAgentColor(id, chartAgentIds))}
                        />
                        {agent?.name || id}
                      </span>
                    )
                  })}
                </div>
                {/* Bars */}
                {(() => {
                  const maxTotal = Math.max(...dailyCompletions.map((d) => d.total), 1)
                  return (
                    <div className="space-y-1">
                      {dailyCompletions.map((day) => (
                        <div key={day.date} className="flex items-center gap-3">
                          <span className="text-xs text-muted w-14 shrink-0 tabular-nums">
                            {formatDay(day.date)}
                          </span>
                          <div className="flex-1 h-4 bg-background rounded-sm overflow-hidden">
                            {day.total > 0 && (
                              <div
                                className="h-full flex rounded-sm overflow-hidden"
                                style={{
                                  width: `${(day.total / maxTotal) * 100}%`,
                                }}
                              >
                                {day.byAgent.map(({ agentId, count }) => (
                                  <div
                                    key={agentId}
                                    className={cn('h-full', getAgentColor(agentId, chartAgentIds))}
                                    style={{
                                      width: `${(count / day.total) * 100}%`,
                                    }}
                                    title={`${agentId}: ${count}`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-mono w-8 text-right shrink-0 text-muted">
                            {day.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </>
            ) : (
              <p className="text-muted text-sm">{t('noCompletions')}</p>
            )}
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* By Agent */}
          <Card padding="md" className="rounded-lg">
            <h2 className="text-sm font-medium mb-4">
              {t('byAgent')}
              {stats.agentSource === 'database-fallback' && (
                <span className="ml-2 text-xs text-person-ink">{t('offlineMode')}</span>
              )}
            </h2>
            {stats.byAgent.length === 0 ? (
              <p className="text-muted text-sm">{t('noAgentData')}</p>
            ) : (
              <div className="space-y-3">
                {stats.byAgent.map(({ agent, total, done, pending, timeMinutes }) => (
                  <div key={agent.id} className="flex items-center gap-3">
                    <ParticipantMark agent={agent} className="h-6" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{agent.name}</div>
                      <div className="text-xs text-muted">
                        {t('tracked', { time: formatTime(timeMinutes) })}
                      </div>
                      <ProgressBar
                        className="mt-1"
                        segments={
                          total > 0
                            ? [
                                {
                                  percent: (done / total) * 100,
                                  color: 'bg-ok',
                                },
                                {
                                  percent: (pending / total) * 100,
                                  color: 'bg-person',
                                },
                              ]
                            : []
                        }
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        <span className="text-ok font-bold">{done}</span>
                        <span className="text-muted"> / </span>
                        <span className="text-person-ink">{pending}</span>
                      </div>
                      <div className="text-2xs text-muted">{t('doneVsPending')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* By Project */}
          <Card padding="md" className="rounded-lg">
            <h2 className="text-sm font-medium mb-4">{t('byProject')}</h2>
            {stats.byProject.length === 0 ? (
              <p className="text-muted text-sm">{t('noProjects')}</p>
            ) : (
              <div className="space-y-3">
                {stats.byProject.slice(0, 8).map(({ project, count, done }) => (
                  <div key={project} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{project}</div>
                      <ProgressBar
                        className="mt-1"
                        segments={[{ percent: (done / count) * 100, color: 'bg-ok' }]}
                      />
                    </div>
                    <div className="text-xs text-muted whitespace-nowrap">
                      {done}/{count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Stale Tasks */}
          {stats.staleTasks.length > 0 && (
            <Card padding="md" className="rounded-lg">
              <h2 className="text-sm font-medium mb-4 text-person-ink">{t('staleTasks')}</h2>
              <div className="space-y-2">
                {stats.staleTasks.slice(0, 5).map((task) => (
                  <Link
                    key={task.id}
                    href={`/?task=${task.id}`}
                    className="block p-2 rounded-sm hover:bg-background transition-colors"
                  >
                    <div className="text-sm truncate">{task.title}</div>
                    <div className="text-xs text-muted">
                      {task.assigned_to} · {format.relativeTime(new Date(task.updated_at), now)}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Activity */}
          <Card padding="md" className="rounded-lg">
            <h2 className="text-sm font-medium mb-4">{t('recentActivity')}</h2>
            {stats.recentActivity.length === 0 ? (
              <p className="text-muted text-sm">{tu('noActivity')}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.recentActivity.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="text-xs border-b border-border pb-2">
                    <div className="text-muted">
                      {format.relativeTime(new Date(activity.created_at), now)}
                    </div>
                    <div className="truncate">{activity.message}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Cost by Agent */}
          {costMetrics && costMetrics.by_agent.length > 0 && (
            <Card padding="md" className="rounded-lg">
              <h2 className="text-sm font-medium mb-4">{t('costByAgent')}</h2>
              <div className="space-y-3">
                {costMetrics.by_agent.map((agent) => {
                  const maxCost = costMetrics.by_agent[0]?.total_cost_usd || 1
                  return (
                    <div key={agent.agent_id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{agent.agent_id}</div>
                        <div className="text-xs text-muted">
                          {tu('agentSessions', {
                            count: agent.session_count,
                            models: agent.by_model.map((m) => m.model).join(', '),
                          })}
                        </div>
                        <ProgressBar
                          className="mt-1"
                          segments={[
                            {
                              percent: (agent.total_cost_usd / maxCost) * 100,
                              color: 'bg-agent',
                            },
                          ]}
                        />
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold tabular-nums">
                          {formatCost(locale, agent.total_cost_usd)}
                        </div>
                        <div className="text-2xs text-muted">
                          {tu('tokens', {
                            count: formatTokens(agent.total_tokens),
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Daily Cost Trend */}
          {costMetrics && costMetrics.daily_trend.length > 0 && (
            <Card padding="md" className="rounded-lg">
              <h2 className="text-sm font-medium mb-4">{t('dailyCostTrend')}</h2>
              <div className="space-y-2">
                {costMetrics.daily_trend.slice(0, 14).map((day) => {
                  const maxDailyCost =
                    Math.max(...costMetrics.daily_trend.map((d) => d.cost_usd)) || 1
                  return (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="text-xs text-muted w-20 shrink-0 tabular-nums">
                        {formatDay(day.date)}
                      </span>
                      <div className="flex-1 h-4 bg-background rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-agent/60 rounded-sm"
                          style={{
                            width: `${(day.cost_usd / maxDailyCost) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono w-16 text-right shrink-0">
                        {formatCost(locale, day.cost_usd)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
