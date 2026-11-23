'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '../../lib/utils'

export type ProjectView = 'overview' | 'settings'

/**
 * The project's two views as a segmented control. They are separate routes,
 * so these are links with aria-current, not ARIA tabs.
 */
export function ProjectViewNav({
  projectId,
  current,
}: {
  projectId: string
  current: ProjectView
}) {
  const t = useTranslations('projectsPage')
  const base = `/projects/${encodeURIComponent(projectId)}`
  const views: { key: ProjectView; href: string; label: string }[] = [
    { key: 'overview', href: base, label: t('viewOverview') },
    { key: 'settings', href: `${base}/settings`, label: t('viewSettings') },
  ]
  return (
    <nav aria-label={t('views')} className="flex rounded border border-border bg-card p-0.5">
      {views.map((view) => {
        const active = view.key === current
        return (
          <Link
            key={view.key}
            href={view.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-3 py-1 rounded-[3px] text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              active ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
            )}
          >
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}
