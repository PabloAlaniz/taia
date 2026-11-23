'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import { BookOpen, GitBranch } from 'lucide-react'
import type { ProjectOverview, Task } from '@taia/types'
import { Strip } from '@/components/atoms'
import { EmptyState, SkeletonCard } from '@/components/molecules'
import { PageHeader } from '@/components/molecules/page-header'
import { ProjectViewNav } from '@/components/molecules/project-view-nav'
import { api } from '@/lib/api'
import { formatUsd, participantKind } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useWaiting } from '@/lib/use-shell-signals'
import type { WaitingReason } from '@/lib/waiting'
import { cn } from '@/lib/utils'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

// A project across every workspace it spans: one row of bays per workspace,
// each laid out with that workspace's own columns.
export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const t = useTranslations('projectsPage')
  const tp = useTranslations('pageTitles')
  const locale = useLocale()
  const [overview, setOverview] = useState<ProjectOverview | null | undefined>(undefined)
  const [costs, setCosts] = useState<Record<string, number>>({})
  // Only the active workspace's tasks are known here; others stay unmarked.
  const waiting = useWaiting()

  useEffect(() => {
    let cancelled = false
    api.projects
      .overview(projectId)
      .then(async (data) => {
        if (cancelled) return
        setOverview(data.ok ? data : null)
        if (!data.ok) return
        const ids = data.workspaces.flatMap((g) => g.tasks.map((task) => task.id))
        if (ids.length === 0) return
        const c = await api.cost.forTasks(ids).catch(() => null)
        if (!cancelled && c?.ok) setCosts(c.costs)
      })
      .catch(() => !cancelled && setOverview(null))
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (overview === undefined) {
    return (
      <div className="mx-auto px-4 md:px-6 max-w-6xl pt-5 space-y-3">
        <SkeletonCard height="h-10" />
        <SkeletonCard height="h-48" />
      </div>
    )
  }
  if (overview === null) {
    return (
      <div className="min-h-full">
        <PageHeader
          width="data"
          title={t('title')}
          backHref="/projects"
          backLabel={tp('projects')}
        />
        <div className="mx-auto px-4 md:px-6 max-w-6xl pt-4 pb-10">
          <EmptyState title={t('notFound')} />
        </div>
      </div>
    )
  }

  const { project, repositories, workspaces } = overview
  const glossary = (project as { glossary?: Record<string, string> | null }).glossary
  const glossaryCount = glossary ? Object.keys(glossary).length : 0
  const totalTasks = workspaces.reduce((n, g) => n + g.tasks.length, 0)
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-full">
      <PageHeader width="data" title={project.name} backHref="/projects" backLabel={tp('projects')}>
        <ProjectViewNav projectId={project.id} current="overview" />
      </PageHeader>

      <div className="mx-auto px-4 md:px-6 max-w-6xl pt-4 pb-10 space-y-6">
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          {project.description && (
            <p className="basis-full text-muted max-w-prose">{project.description}</p>
          )}
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted">{t('tasksLabel')}</dt>
            <dd className="font-semibold tabular-nums">{totalTasks}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted">{t('costLabel')}</dt>
            <dd className="font-semibold tabular-nums">{formatUsd(locale, totalCost)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t('glossaryLabel')}</dt>
            <BookOpen size={14} className="text-muted" aria-hidden="true" />
            <dd>{t('glossaryTerms', { count: glossaryCount })}</dd>
          </div>
          {repositories.length > 0 && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t('repositories')}</dt>
              <GitBranch size={14} className="text-muted" aria-hidden="true" />
              <dd className="font-mono text-xs">{repositories.map((r) => r.name).join(', ')}</dd>
            </div>
          )}
        </dl>

        {workspaces.length === 0 && (
          <EmptyState title={t('noTasksShort')} description={t('noTasks')} />
        )}

        {workspaces.map(({ workspace, columns, tasks }) => (
          <section key={workspace.id} aria-labelledby={`ws-${workspace.id}`} className="space-y-2">
            <h2
              id={`ws-${workspace.id}`}
              className="flex items-baseline gap-2 text-lg font-semibold"
            >
              {workspace.name}
              <span className="text-sm font-normal text-muted">
                {t('taskCount', { count: tasks.length })}
              </span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {columnsWithTasks(columns, tasks).map(({ key, label, items }) => (
                <Bay key={key} label={label} items={items} costs={costs} waiting={waiting} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Bay({
  label,
  items,
  costs,
  waiting,
}: {
  label: string
  items: Task[]
  costs: Record<string, number>
  waiting: Record<string, WaitingReason>
}) {
  const locale = useLocale()
  const agents = useStore((s) => s.agents)
  const total = items.reduce((sum, task) => sum + (costs[task.id] ?? 0), 0)
  // Like the board: what waits on a person sorts to the top of its bay.
  const ordered = [...items].sort((a, b) => Number(!!waiting[b.id]) - Number(!!waiting[a.id]))
  return (
    <div className="bg-rack rounded-md flex-1 min-w-56 flex flex-col">
      <div className="flex items-baseline gap-2 pl-4 pr-3 pt-2.5 pb-2 border-b border-rack-line">
        <h3 className="text-xs font-semibold tracking-[0.08em] uppercase text-rack-heading truncate">
          {label}
        </h3>
        <span className="text-xs tabular-nums text-on-rack-muted">{items.length}</span>
        {total > 0 && (
          <span className="ml-auto text-xs tabular-nums text-on-rack-muted">
            {formatUsd(locale, total)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 pl-4 pr-2.5 py-2.5">
        {ordered.map((task) => {
          const assignee = agents.find((a) => a.id === task.assigned_to)
          const kind = participantKind(assignee)
          const reason = waiting[task.id]
          const done = task.status === 'DONE'
          return (
            <Strip
              key={task.id}
              kind={kind ?? 'none'}
              waiting={!!reason}
              quiet={done && !reason}
              className={cn('py-1.5 pl-3.5 pr-2.5', reason && '-ml-4 pb-2')}
            >
              <Link
                href={`/task/${task.id}`}
                className="block no-underline text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent rounded-[2px]"
              >
                {reason && <WaitingLine reason={reason} />}
                {/* Same anatomy as the board strip: id above the title. */}
                <span className="block font-mono text-xxs text-muted leading-none mb-0.5">
                  {shortTaskId(task.id)}
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'text-sm leading-snug line-clamp-2',
                      done && !reason
                        ? 'font-medium text-muted line-through decoration-muted/60'
                        : 'font-semibold',
                    )}
                  >
                    {task.title}
                  </span>
                </span>
                <span className="flex items-baseline gap-2 text-mid text-muted mt-0.5">
                  <span
                    className={cn(
                      'truncate font-semibold',
                      kind === 'person'
                        ? 'text-person-ink'
                        : kind === 'agent'
                          ? 'text-agent-ink'
                          : 'font-normal',
                    )}
                  >
                    {assignee?.name ?? '—'}
                  </span>
                  <span className={cn('ml-auto tabular-nums', !done && 'text-foreground')}>
                    {costs[task.id] !== undefined ? formatUsd(locale, costs[task.id]) : '—'}
                  </span>
                </span>
              </Link>
            </Strip>
          )
        })}
      </div>
    </div>
  )
}

/** The board's TE ESPERA tag and its reason, above the strip's title. */
function WaitingLine({ reason }: { reason: WaitingReason }) {
  const t = useTranslations('taskCard')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  return (
    <span className="flex items-baseline gap-2 mb-1">
      <span className="shrink-0 whitespace-nowrap text-xxs font-bold tracking-[0.12em] uppercase bg-person text-on-person px-1.5 rounded-[2px]">
        {t('waitingTag')}
      </span>
      <span className="text-xs text-muted truncate">
        {reason.kind === 'approval' &&
          t('waitingApproval', {
            time: format.relativeTime(new Date(reason.approval.created_at), now),
          })}
        {reason.kind === 'merge' && t('waitingMerge')}
        {reason.kind === 'clarify' && t('waitingClarify')}
      </span>
    </span>
  )
}

/** The workspace's columns in order, plus one for statuses with no column. */
function columnsWithTasks(
  columns: ProjectOverview['workspaces'][number]['columns'],
  tasks: Task[],
) {
  const ordered = [...columns].sort((a, b) => a.position - b.position)
  const known = new Set(ordered.map((c) => c.slug))
  const result = ordered.map((c) => ({
    key: c.slug,
    label: c.label,
    items: tasks.filter((task) => task.status === c.slug),
  }))
  const orphans = tasks.filter((task) => !known.has(task.status))
  if (orphans.length > 0) result.push({ key: '__other', label: '…', items: orphans })
  return result
}
