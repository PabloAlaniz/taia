'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { BookOpen, GitBranch } from 'lucide-react'
import type { ProjectOverview, Task } from '@taia/types'
import { Strip } from '@/components/atoms'
import { EmptyState, SkeletonCard } from '@/components/molecules'
import { PageHeader } from '@/components/molecules/page-header'
import { api } from '@/lib/api'
import { formatUsd, participantKind } from '@/lib/format'
import { useStore } from '@/lib/store'
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
      <div className="mx-auto max-w-6xl px-4 md:px-6 pt-6 space-y-3">
        <SkeletonCard height="h-10" />
        <SkeletonCard height="h-48" />
      </div>
    )
  }
  if (overview === null) {
    return (
      <div className="min-h-full">
        <PageHeader title={t('title')} backHref="/projects" backLabel={tp('projects')} />
        <div className="mx-auto max-w-6xl px-4 md:px-6">
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
      <PageHeader title={project.name} backHref="/projects" backLabel={tp('projects')}>
        <Link
          href="/settings/projects"
          className="rounded border border-border bg-card px-3 py-1.5 text-sm font-semibold no-underline text-foreground hover:bg-strip"
        >
          {t('manage')}
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 md:px-6 pt-3 pb-10 space-y-6">
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
                <Bay key={key} label={label} items={items} costs={costs} />
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
}: {
  label: string
  items: Task[]
  costs: Record<string, number>
}) {
  const locale = useLocale()
  const agents = useStore((s) => s.agents)
  const total = items.reduce((sum, task) => sum + (costs[task.id] ?? 0), 0)
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
        {items.map((task) => {
          const assignee = agents.find((a) => a.id === task.assigned_to)
          const kind = participantKind(assignee)
          return (
            <Strip key={task.id} kind={kind ?? 'none'} className="py-1.5 pl-3.5 pr-2.5">
              <Link
                href={`/task/${task.id}`}
                className="block no-underline text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent rounded-[2px]"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xxs text-muted shrink-0">
                    {shortTaskId(task.id)}
                  </span>
                  <span className="text-sm font-semibold leading-snug line-clamp-2">
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
                  <span className="ml-auto tabular-nums text-foreground/75">
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
