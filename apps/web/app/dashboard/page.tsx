'use client'

import { useState, useMemo } from 'react'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import type { Task, Agent, Activity, BoardColumn, CostDashboardMetrics } from '@taia/types'
import { Button, Select, Strip, type StripKind } from '../../components/atoms'
import { FigureBar } from '@/components/atoms/figure-bar'
import { RackSection } from '@/components/molecules/rack-section'
import { PageHeader } from '@/components/molecules/page-header'
import { ReadoutStrip, type Readout } from '@/components/molecules/readout-strip'
import {
  boardStages,
  completedSlugs,
  completionDate,
  computeDailyCompletions,
  isCompleted,
  isOpen,
  isStale,
  stageCounts,
} from '../../lib/dashboard-utils'
import { cn } from '../../lib/utils'
import { useResource } from '@/lib/use-resource'
import { actorName, formatTokens, formatUsd, participantKind } from '@/lib/format'
import { useStore } from '../../lib/store'
import { useLiveStore, useWaiting } from '@/lib/use-shell-signals'
import { useActivityText } from '@/lib/use-activity-text'

type PeriodFilter = '24h' | 'week' | 'month' | 'all'

interface Stats {
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
    open: number
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

/** The workspace's columns, to know which ones count as completed. */
async function optionalColumns(res: Response | null): Promise<BoardColumn[] | null> {
  if (!res?.ok) return null
  try {
    const data = (await res.json()) as { columns?: BoardColumn[] }
    return data.columns ?? null
  } catch {
    return null
  }
}

interface DashboardData {
  stats: Stats
  costMetrics: CostDashboardMetrics | null
  usageMetrics: UsageAnalyticsMetrics | null
  tasks: Task[]
  agents: Agent[]
  doneSlugs: ReadonlySet<string>
}

async function loadDashboard(
  period: PeriodFilter,
  workspaceId: string | null,
): Promise<DashboardData> {
  // Tasks and activity of the active workspace; agents and costs are shared.
  const scope = workspaceId ? `workspace_id=${encodeURIComponent(workspaceId)}` : ''
  const [tasksRes, agentsRes, activityRes, costRes, usageRes, columnsRes] = await Promise.all([
    fetch(`/api/tasks${scope ? `?${scope}` : ''}`),
    fetch('/api/agents'),
    fetch(`/api/activities?limit=20${scope ? `&${scope}` : ''}`),
    fetch(`/api/cost/dashboard?period=${period}`).catch(() => null),
    fetch(`/api/usage-analytics?${getUsageAnalyticsParams(period, workspaceId)}`).catch(() => null),
    workspaceId
      ? fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/columns`).catch(() => null)
      : Promise.resolve(null),
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
  // Completed = in one of the workspace's finished columns (Hecho, Publicado…),
  // the same columns the board files as done. In progress, in review and
  // open read the columns too, the way the team page counts them.
  const columns = await optionalColumns(columnsRes)
  const doneSlugs = completedSlugs(columns)
  const done = (t: Task) => isCompleted(t, doneSlugs)
  const stages = boardStages(columns)

  // The period filter applies to the breakdowns (by participant, by project,
  // average time). "Now" and "today / this week" are their own windows, so
  // they read every task of the workspace.
  const periodStart = getPeriodStart(period)
  const tasks = periodStart
    ? allTasks.filter((t) => new Date(t.created_at) >= periodStart)
    : allTasks

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  const completedSince = (since: Date) =>
    allTasks.filter((t) => {
      if (!done(t)) return false
      const at = completionDate(t)
      return at !== null && at >= since
    }).length

  // Time stats
  const tasksWithTime = tasks.filter(
    (t) => done(t) && t.time_spent_minutes && t.time_spent_minutes > 0,
  )
  const avgTimeMinutes =
    tasksWithTime.length > 0
      ? Math.round(
          tasksWithTime.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0) /
            tasksWithTime.length,
        )
      : 0

  // By participant: what each one holds now (every open task, whatever the
  // period, as the team page counts it) and what they finished in the period.
  const byAgent = agents
    .filter((a) => a.type !== 'orchestrator')
    .map((agent) => {
      const doneTasks = tasks.filter((t) => t.assigned_to === agent.id && done(t))
      const open = allTasks.filter((t) => t.assigned_to === agent.id && isOpen(t, stages)).length
      const timeMinutes = doneTasks.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0)
      return {
        agent,
        total: doneTasks.length + open,
        done: doneTasks.length,
        open,
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
      done: tasks.filter((t) => t.project === project && done(t)).length,
    }))
    .sort((a, b) => b.count - a.count)

  // Stale: someone holds it, it has not started, and nothing moved in a day.
  const staleTasks = allTasks.filter((t) => isStale(t, stages, now))
  const nowCounts = stageCounts(allTasks, stages)

  const stats: Stats = {
    completedToday: completedSince(todayStart),
    completedThisWeek: completedSince(weekStart),
    inProgress: nowCounts.in_progress,
    inReview: nowCounts.review,
    blocked: allTasks.filter(
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
    doneSlugs,
  }
}

/** Bar fill for a participant kind; tasks with no one on them stay neutral. */
const KIND_FILL: Record<StripKind, string> = {
  agent: 'bg-agent',
  person: 'bg-person',
  none: 'bg-field',
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const tu = useTranslations('dashboardUi')
  const tActors = useTranslations('actors')
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
  const doneSlugs = data?.doneSlugs
  const rawAgents = data?.agents ?? []
  // Names the way the board shows them, never raw ids: TAIA's own actors
  // (web-ui, system…) get a readable name too.
  const agentName = (id?: string | null) => actorName(id, rawAgents, tActors) || '—'
  const kindOf = (id?: string | null): StripKind =>
    participantKind(rawAgents.find((a) => a.id === id)) ?? 'none'
  const waitingCount = Object.keys(useWaiting()).length
  // The same 24 h figure the top bar shows, from the same poll.
  const spend24h = useLiveStore((s) => s.costToday)
  const describe = useActivityText()

  // Only days that closed something: the rack is a log, not a calendar.
  const completionDays = useMemo(
    () =>
      computeDailyCompletions(rawTasks, 30, doneSlugs)
        .filter((d) => d.total > 0)
        .reverse(),
    [rawTasks, doneSlugs],
  )

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
      weekday: 'short',
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

  const staleCount = stats.staleTasks.length
  const nowItems: Readout[] = [
    {
      id: 'waiting',
      value: waitingCount,
      label: tu('nowWaiting', { count: waitingCount }),
      tone: 'waiting',
      href: '/?view=waiting',
      linkLabel: tu('nowWaitingLink', { count: waitingCount }),
    },
    { id: 'progress', value: stats.inProgress, label: tu('nowInProgress') },
    { id: 'review', value: stats.inReview, label: tu('nowInReview') },
    {
      id: 'blocked',
      value: stats.blocked,
      label: tu('nowBlocked', { count: stats.blocked }),
      tone: 'alert',
    },
    { id: 'stale', value: staleCount, label: tu('nowStale', { count: staleCount }) },
  ]
  if (spend24h !== null) {
    nowItems.push({
      id: 'spend',
      value: formatUsd(locale, spend24h),
      label: tu('nowSpend'),
      zero: spend24h === 0,
    })
  }

  const paceItems: Readout[] = [
    {
      id: 'today',
      value: stats.completedToday,
      label: tu('paceToday', { count: stats.completedToday }),
    },
    {
      id: 'week',
      value: stats.completedThisWeek,
      label: tu('paceWeek', { count: stats.completedThisWeek }),
    },
    {
      id: 'avg',
      value: stats.avgTimeMinutes > 0 ? formatTime(stats.avgTimeMinutes) : '—',
      label: tu('paceAvgTime'),
      zero: stats.avgTimeMinutes === 0,
    },
  ]
  if (usageMetrics) {
    paceItems.push({
      id: 'p95',
      value: tu('days', {
        days: format.number(usageMetrics.aging.p95_age_days, { maximumFractionDigits: 1 }),
      }),
      label: tu('paceP95'),
      zero: usageMetrics.aging.p95_age_days === 0,
    })
  }

  const maxDayTotal = Math.max(1, ...completionDays.map((d) => d.total))
  const maxParticipantTotal = Math.max(1, ...stats.byAgent.map((a) => a.total))
  const showSpend = !!costMetrics && costMetrics.totals.total_tokens > 0
  const spendDays = costMetrics?.daily_trend.slice(0, 14) ?? []
  const maxDailySpend = Math.max(0, ...spendDays.map((d) => d.cost_usd)) || 1
  const maxAgentSpend = costMetrics?.by_agent[0]?.total_cost_usd || 1

  return (
    <div className="min-h-full">
      <PageHeader width="data" title={t('title')}>
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
          aria-label={tu('period')}
          className="w-auto py-1 text-sm"
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

      <div className="mx-auto px-4 md:px-6 max-w-6xl pt-5 pb-10 space-y-5">
        {/* Now: the shift in one line. What waits on you, what moves, what's
            stuck, and what the last 24 h cost. */}
        <RackSection title={tu('nowSection')} id="dash-now">
          <ReadoutStrip label={tu('nowSection')} items={nowItems} />
        </RackSection>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
          <div className="space-y-5 min-w-0">
            {/* Pace: what got closed, day by day. */}
            <RackSection
              title={tu('flowSection')}
              id="dash-pace"
              aside={
                usageMetrics ? (
                  <a
                    href={`/api/usage-analytics?${getUsageAnalyticsParams(period, activeWorkspaceId, 'csv')}`}
                    download="usage-analytics.csv"
                    aria-label={tu('exportCsvLabel')}
                    className="rounded border border-rack-line px-2.5 py-1 text-xs font-semibold text-on-rack no-underline hover:text-white hover:border-on-rack-muted focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {tu('exportCsv')}
                  </a>
                ) : undefined
              }
            >
              <ReadoutStrip label={tu('flowSection')} items={paceItems} />
              {usageMetrics && (
                <p className="text-xs text-on-rack-muted max-w-prose">{tu('agingNote')}</p>
              )}

              <RackSubhead>{tu('completedByDay')}</RackSubhead>
              {completionDays.length === 0 ? (
                <p className="text-mid text-on-rack-muted">{t('noCompletions')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5" aria-label={tu('completedByDay')}>
                  {completionDays.map((day) => (
                    <li key={day.date}>
                      <Strip className="py-1.5">
                        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1">
                          <span className="text-mid text-muted">{formatDay(day.date)}</span>
                          <FigureBar
                            max={maxDayTotal}
                            segments={day.byAgent.map(({ agentId, count }) => ({
                              value: count,
                              className: KIND_FILL[kindOf(agentId)],
                            }))}
                          />
                          <span className="text-right text-sm font-semibold tabular-nums">
                            {day.total}
                          </span>
                          <span className="col-start-2 col-span-2 text-mid text-muted truncate">
                            {day.byAgent
                              .map(({ agentId, count }) =>
                                tu('nameCount', {
                                  name:
                                    agentId === 'unassigned'
                                      ? tu('unassigned')
                                      : agentName(agentId),
                                  count,
                                }),
                              )
                              .join(' · ')}
                          </span>
                        </div>
                      </Strip>
                    </li>
                  ))}
                </ul>
              )}
            </RackSection>

            {/* Who holds what: one strip per participant, agents and people alike. */}
            <RackSection
              title={t('byAgent')}
              id="dash-participants"
              aside={stats.agentSource === 'database-fallback' ? t('offlineMode') : undefined}
            >
              {stats.byAgent.length === 0 ? (
                <p className="text-mid text-on-rack-muted">{t('noAgentData')}</p>
              ) : (
                <>
                  <div
                    aria-hidden="true"
                    className="hidden sm:grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem] gap-x-3 pl-4 pr-3 text-xs font-semibold tracking-[0.08em] uppercase text-on-rack-muted"
                  >
                    <span />
                    <span className="text-right">{tu('colOpen')}</span>
                    <span className="text-right">{tu('colDone')}</span>
                    <span className="text-right">{tu('colTime')}</span>
                  </div>
                  <ul className="flex flex-col gap-1.5" aria-label={t('byAgent')}>
                    {stats.byAgent.map(({ agent, done, open, timeMinutes }) => (
                      <li key={agent.id}>
                        <Strip kind={participantKind(agent) ?? 'none'} className="py-2">
                          <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem] sm:items-center sm:gap-x-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{agent.name}</div>
                              <FigureBar
                                className="mt-1.5 max-w-48"
                                max={maxParticipantTotal}
                                segments={[
                                  { value: done, className: 'bg-ok' },
                                  { value: open, className: 'bg-field' },
                                ]}
                              />
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 sm:contents">
                              <Figure value={open} label={tu('colOpen')} />
                              <Figure value={done} label={tu('colDone')} />
                              <Figure
                                value={timeMinutes > 0 ? formatTime(timeMinutes) : '—'}
                                label={tu('colTime')}
                                quiet={timeMinutes === 0}
                              />
                            </div>
                          </div>
                        </Strip>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </RackSection>
          </div>

          <div className="space-y-5 min-w-0">
            {/* Stale Tasks: strips straight in the rack, like any list of work. */}
            {staleCount > 0 && (
              <RackSection title={t('staleTasks')} count={staleCount} id="dash-stale">
                {stats.staleTasks.slice(0, 5).map((task) => (
                  <Strip key={task.id} kind={kindOf(task.assigned_to)} className="hover:bg-card">
                    <Link
                      href={`/task/${task.id}`}
                      className="block no-underline text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent rounded-[2px]"
                    >
                      <span className="block text-sm font-semibold truncate">{task.title}</span>
                      <span className="block text-mid text-muted">
                        {agentName(task.assigned_to)} ·{' '}
                        {format.relativeTime(new Date(task.updated_at), now)}
                      </span>
                    </Link>
                  </Strip>
                ))}
              </RackSection>
            )}

            {/* The log of the shift: who did what, newest first. */}
            <RackSection title={t('recentActivity')} id="dash-activity">
              {stats.recentActivity.length === 0 ? (
                <p className="text-mid text-on-rack-muted">{tu('noActivity')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5" aria-label={t('recentActivity')}>
                  {stats.recentActivity.slice(0, 10).map((activity) => (
                    <li key={activity.id}>
                      <Strip kind={kindOf(activity.agent_id)} className="py-1.5">
                        <div className="flex items-baseline gap-2 text-mid">
                          {activity.agent_id && (
                            <span className="font-semibold truncate">
                              {agentName(activity.agent_id)}
                            </span>
                          )}
                          <span className="ml-auto shrink-0 text-muted">
                            {format.relativeTime(new Date(activity.created_at), now)}
                          </span>
                        </div>
                        <div className="text-mid text-muted truncate">{describe(activity)}</div>
                      </Strip>
                    </li>
                  ))}
                </ul>
              )}
            </RackSection>

            {/* By Project */}
            <RackSection title={t('byProject')} id="dash-projects">
              {stats.byProject.length === 0 ? (
                <p className="text-mid text-on-rack-muted">{t('noProjects')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5" aria-label={t('byProject')}>
                  {stats.byProject.slice(0, 8).map(({ project, count, done }) => (
                    <li key={project}>
                      <Strip className="py-2">
                        <div className="flex items-baseline gap-3">
                          <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                            {project}
                          </span>
                          <span className="text-mid text-muted tabular-nums whitespace-nowrap">
                            {tu('doneOfTotal', { done, total: count })}
                          </span>
                        </div>
                        <FigureBar
                          className="mt-1.5"
                          max={count}
                          segments={[{ value: done, className: 'bg-ok' }]}
                        />
                      </Strip>
                    </li>
                  ))}
                </ul>
              )}
            </RackSection>
          </div>
        </div>
        {/* Spend TAIA recorded from past sessions: it outlives the runtime that
                ran them, so it reads as a record, not as live state. */}
        {showSpend && costMetrics && (
          <RackSection title={t('costSection')} id="dash-spend">
            <ReadoutStrip
              label={t('costSection')}
              items={[
                {
                  id: 'total',
                  value: formatUsd(locale, costMetrics.totals.total_cost_usd),
                  label: tu('spendTotal'),
                  zero: costMetrics.totals.total_cost_usd === 0,
                },
                {
                  id: 'tokens',
                  value: formatTokens(costMetrics.totals.total_tokens),
                  label: tu('spendTokens'),
                },
                {
                  id: 'sessions',
                  value: costMetrics.totals.session_count,
                  label: tu('spendSessions', { count: costMetrics.totals.session_count }),
                },
                {
                  id: 'models',
                  value: costMetrics.by_model.length,
                  label: tu('spendModels', { count: costMetrics.by_model.length }),
                },
              ]}
            />
            <p className="text-xs text-on-rack-muted max-w-prose">{t('costNote')}</p>

            <div className="grid gap-x-5 gap-y-1.5 lg:grid-cols-2 lg:items-start">
              {costMetrics.by_agent.length > 0 && (
                <div className="flex flex-col gap-1.5 min-w-0">
                  <RackSubhead>{tu('spendByParticipant')}</RackSubhead>
                  <ul className="flex flex-col gap-1.5" aria-label={tu('spendByParticipant')}>
                    {costMetrics.by_agent.map((row) => (
                      <li key={row.agent_id}>
                        <Strip kind={kindOf(row.agent_id)} className="py-2">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                            <span className="text-sm font-semibold truncate">
                              {agentName(row.agent_id)}
                            </span>
                            <span className="text-sm font-semibold tabular-nums text-right">
                              {formatUsd(locale, row.total_cost_usd)}
                            </span>
                            <span className="text-mid text-muted truncate">
                              {tu('agentSessions', {
                                count: row.session_count,
                                models: row.by_model.map((m) => m.model).join(', '),
                              })}
                            </span>
                            <span className="text-mid text-muted tabular-nums text-right">
                              {tu('tokens', { count: formatTokens(row.total_tokens) })}
                            </span>
                          </div>
                          <FigureBar
                            className="mt-1.5"
                            max={maxAgentSpend}
                            segments={[
                              {
                                value: row.total_cost_usd,
                                className: KIND_FILL[kindOf(row.agent_id)],
                              },
                            ]}
                          />
                        </Strip>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {spendDays.length > 0 && (
                <div className="flex flex-col gap-1.5 min-w-0">
                  <RackSubhead>{tu('spendByDay')}</RackSubhead>
                  <ul className="flex flex-col gap-1.5" aria-label={tu('spendByDay')}>
                    {spendDays.map((day) => (
                      <li key={day.date}>
                        <Strip className="py-1.5">
                          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3">
                            <span className="text-mid text-muted">{formatDay(day.date)}</span>
                            <FigureBar
                              max={maxDailySpend}
                              segments={[{ value: day.cost_usd, className: 'bg-field' }]}
                            />
                            <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums">
                              {formatUsd(locale, day.cost_usd)}
                            </span>
                          </div>
                        </Strip>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </RackSection>
        )}
      </div>
    </div>
  )
}

/** A small rack label inside a rack: splits one rack into parts. */
function RackSubhead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-2 text-xs font-semibold tracking-[0.08em] uppercase text-on-rack-muted">
      {children}
    </h3>
  )
}

/**
 * One right-aligned figure in a participant strip. The column header names it
 * from sm up; below that the words sit next to the number.
 */
function Figure({
  value,
  label,
  quiet,
}: {
  value: string | number
  label: string
  quiet?: boolean
}) {
  const zero = quiet ?? value === 0
  return (
    <span className="flex items-baseline gap-1.5 sm:justify-end">
      <span
        className={cn(
          'text-sm tabular-nums',
          zero ? 'font-medium text-muted' : 'font-semibold text-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-mid text-muted sm:sr-only">{label}</span>
    </span>
  )
}
