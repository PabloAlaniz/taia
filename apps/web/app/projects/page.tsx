'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import { ChevronRight, FolderPlus, Plus } from 'lucide-react'
import type { Project } from '@taia/types'
import { Button, Input, Strip } from '@/components/atoms'
import { EmptyState, RackSection, SkeletonCard } from '@/components/molecules'
import { PageHeader } from '@/components/molecules/page-header'
import { api, type ProjectSummary } from '@/lib/api'
import { formatUsd } from '@/lib/format'

// Projects cut across workspaces: this page lists every project, whatever
// workspace is active.
export default function ProjectsPage() {
  const t = useTranslations('projectsPage')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({})
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [list, summary] = await Promise.all([
      api.projects.list(),
      api.projects.summary().catch(() => null),
    ])
    setProjects(list.projects ?? [])
    if (summary?.ok) {
      setSummaries(Object.fromEntries(summary.summaries.map((s) => [s.project_id, s])))
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([api.projects.list(), api.projects.summary().catch(() => null)])
      .then(([list, summary]) => {
        if (cancelled) return
        setProjects(list.projects ?? [])
        if (summary?.ok) {
          setSummaries(Object.fromEntries(summary.summaries.map((s) => [s.project_id, s])))
        }
      })
      .catch(() => !cancelled && setProjects([]))
    return () => {
      cancelled = true
    }
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.projects.create({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      if (!res.ok) throw new Error()
      setName('')
      setDescription('')
      setShowForm(false)
      await load()
    } catch {
      setError(t('createFailed'))
    } finally {
      setSaving(false)
    }
  }

  const totalCost = Object.values(summaries).reduce((sum, s) => sum + s.cost_usd, 0)
  const locale = useLocale()

  return (
    <div className="min-h-full">
      <PageHeader width="medium" title={t('title')}>
        <Button
          variant="primary"
          size="md"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          className="flex items-center gap-1.5"
        >
          <Plus size={15} aria-hidden="true" />
          {t('new')}
        </Button>
      </PageHeader>

      <div className="px-4 md:px-6 pt-4 pb-10 max-w-4xl mx-auto space-y-4">
        <p className="text-sm text-muted max-w-prose">{t('intro')}</p>

        {showForm && (
          <Strip waiting className="p-4">
            <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end">
              <label className="grid gap-1 text-sm font-medium">
                {t('name')}
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t('description')}
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="md" onClick={() => setShowForm(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={saving || !name.trim()}>
                  {t('create')}
                </Button>
              </div>
              {error && (
                <p role="alert" className="sm:col-span-3 text-sm text-alert">
                  {error}
                </p>
              )}
            </form>
          </Strip>
        )}

        <RackSection
          title={t('title')}
          count={projects?.length}
          aside={
            totalCost > 0 ? (
              <span className="tabular-nums">{formatUsd(locale, totalCost)}</span>
            ) : undefined
          }
        >
          {projects === null ? (
            [1, 2].map((i) => <SkeletonCard key={i} height="h-16" />)
          ) : projects.length === 0 ? (
            <EmptyState
              onRack
              icon={<FolderPlus size={22} aria-hidden="true" />}
              title={t('empty')}
              description={t('emptyHint')}
              action={
                <Button variant="secondary" size="md" onClick={() => setShowForm(true)}>
                  {t('new')}
                </Button>
              }
            />
          ) : (
            projects.map((p) => <ProjectRow key={p.id} project={p} summary={summaries[p.id]} />)
          )}
        </RackSection>
      </div>
    </div>
  )
}

function ProjectRow({ project, summary }: { project: Project; summary?: ProjectSummary }) {
  const t = useTranslations('projectsPage')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const locale = useLocale()
  const total = summary?.total_tasks ?? 0
  const done = summary?.done_tasks ?? 0
  const open = total - done

  return (
    <Strip className="py-2.5">
      <Link
        href={`/projects/${project.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 no-underline text-foreground group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent rounded-[2px]"
      >
        <div className="min-w-0">
          <h3 className="font-semibold text-base truncate">{project.name}</h3>
          <p className="text-sm text-muted truncate">{project.description || t('noDescription')}</p>
        </div>

        <div className="hidden md:block min-w-0">
          {total > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-2 text-mid tabular-nums">
                <span>{t('openTasks', { count: open })}</span>
                <span className="text-muted">{t('doneTasks', { count: done })}</span>
              </div>
              <div
                className="mt-1 h-1 rounded-full bg-border overflow-hidden"
                role="img"
                aria-label={t('progressAria', { done, total })}
              >
                <div className="h-full bg-ok" style={{ width: `${(done / total) * 100}%` }} />
              </div>
            </>
          ) : (
            <span className="text-mid text-muted">{t('noTasksShort')}</span>
          )}
        </div>

        <div className="flex items-center gap-5 text-mid text-muted tabular-nums whitespace-nowrap">
          {summary && summary.workspaces > 0 && (
            <span className="hidden sm:inline">
              {t('workspaces', { count: summary.workspaces })}
            </span>
          )}
          <span className="text-foreground/80">
            {summary?.cost_usd ? formatUsd(locale, summary.cost_usd) : '—'}
          </span>
          {summary?.last_activity && (
            <time dateTime={summary.last_activity} className="hidden lg:inline">
              {format.relativeTime(
                // Never "in 5 hours": a clock skew must not read as the future.
                new Date(Math.min(new Date(summary.last_activity).getTime(), now.getTime())),
                now,
              )}
            </time>
          )}
          <ChevronRight size={16} className="group-hover:text-foreground" aria-hidden="true" />
        </div>
      </Link>
    </Strip>
  )
}
