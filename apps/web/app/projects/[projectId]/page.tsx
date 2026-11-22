'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ProjectOverview, Task } from '@taia/types'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'
import { api } from '@/lib/api'

// A project across every workspace it spans: one section per workspace, each
// laid out with that workspace's own columns.
export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const t = useTranslations('projectsPage')
  const [overview, setOverview] = useState<ProjectOverview | null | undefined>(undefined)

  useEffect(() => {
    api.projects
      .overview(projectId)
      .then((data) => setOverview(data.ok ? data : null))
      .catch(() => setOverview(null))
  }, [projectId])

  if (overview === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-2xl">⏳</span>
      </div>
    )
  }
  if (overview === null) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title={t('title')} backHref="/projects" />
        <p className="p-4 text-sm text-muted">{t('notFound')}</p>
      </div>
    )
  }

  const { project, repositories, workspaces } = overview
  const glossary = (project as { glossary?: Record<string, string> | null }).glossary
  const glossaryCount = glossary ? Object.keys(glossary).length : 0
  const totalTasks = workspaces.reduce((n, g) => n + g.tasks.length, 0)

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={project.name} icon="🗂️" backHref="/projects">
        <span className="text-xs text-muted">{t('taskCount', { count: totalTasks })}</span>
        <Link href="/settings/projects" className="text-xs text-accent no-underline">
          {t('manage')}
        </Link>
      </PageHeader>

      <main className="p-4 flex flex-col gap-4">
        <Card padding="md" className="flex flex-col gap-2">
          {project.description && <p className="text-sm">{project.description}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span>📖 {t('glossaryTerms', { count: glossaryCount })}</span>
            {repositories.length > 0 && (
              <span>
                {t('repositories')}: {repositories.map((r) => r.name).join(', ')}
              </span>
            )}
          </div>
        </Card>

        {workspaces.length === 0 && <p className="text-sm text-muted">{t('noTasks')}</p>}

        {workspaces.map(({ workspace, columns, tasks }) => (
          <section key={workspace.id} className="flex flex-col gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <span>{workspace.icon ?? '📋'}</span>
              {workspace.name}
              <span className="text-xs text-muted font-normal">
                {t('taskCount', { count: tasks.length })}
              </span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {columnsWithTasks(columns, tasks).map(({ key, label, icon, items }) => (
                <Card key={key} padding="sm" className="min-w-56 w-56 shrink-0 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted flex justify-between">
                    <span>
                      {icon && <>{icon} </>}
                      {label}
                    </span>
                    <span>{items.length}</span>
                  </div>
                  {items.map((task) => (
                    <Link
                      key={task.id}
                      href={`/task/${task.id}`}
                      className="text-sm text-foreground no-underline bg-background border border-border rounded-md px-2 py-1 hover:border-accent"
                    >
                      {task.title}
                    </Link>
                  ))}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </main>
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
    icon: c.icon,
    items: tasks.filter((task) => task.status === c.slug),
  }))
  const orphans = tasks.filter((task) => !known.has(task.status))
  if (orphans.length > 0)
    result.push({ key: '__other', label: '…', icon: undefined, items: orphans })
  return result
}
