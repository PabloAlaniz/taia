'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Plug } from 'lucide-react'
import { useRuntimeStatus } from '../../lib/use-runtime-status'

/**
 * Shown where a page needs something the runtime provides (sessions,
 * transcripts, cron). In standalone mode it says so and where to change it,
 * instead of an empty list that looks broken.
 */
export function RuntimeNotice({ feature }: { feature: 'sessions' | 'cron' }) {
  const t = useTranslations('runtimeNotice')
  const status = useRuntimeStatus()
  if (status.configured || status.state === 'unknown') return null
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-card px-4 py-3">
      <Plug size={18} className="text-muted mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-60">
        <p className="text-sm font-semibold">{t(`${feature}.title`)}</p>
        <p className="text-sm text-muted mt-0.5">{t(`${feature}.body`)}</p>
      </div>
      <Link
        href="/settings/runtime"
        className="rounded border border-border bg-background px-3 py-1.5 text-sm font-semibold no-underline text-foreground hover:bg-strip"
      >
        {t('choose')}
      </Link>
    </div>
  )
}
