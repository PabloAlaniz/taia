'use client'

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { ActiveSession } from '@taia/types'
import { api } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { cn, sessionHref } from '../../lib/utils'
import { formatTokens, formatUsd } from '../../lib/format'
import { Strip } from '../atoms'
import { EmptyState, RackSection, SkeletonCard } from '../molecules'

interface ActiveSessionsGridProps {
  onSessionCount?: (count: number) => void
}

/** Sessions running now, as strips in one rack: who, on what, doing what, at what cost. */
export function ActiveSessionsGrid({ onSessionCount }: ActiveSessionsGridProps) {
  const t = useTranslations('sessionsPage')
  const {
    data: sessions = [],
    loading,
    error,
  } = useResource(
    'sessions:active',
    async () => {
      try {
        const data = await api.sessions.active()
        const active = data.active || []
        onSessionCount?.(active.length)
        return active
      } catch (e) {
        onSessionCount?.(0)
        throw e instanceof Error ? e : new Error('Failed to fetch sessions')
      }
    },
    { refreshMs: 5000 },
  )

  const total = sessions.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0)
  const locale = useLocale()

  return (
    <RackSection
      title={t('running')}
      count={loading ? undefined : sessions.length}
      aside={
        sessions.length > 0 ? (
          <span className="tabular-nums">{formatUsd(locale, total)}</span>
        ) : undefined
      }
    >
      {loading ? (
        [1, 2].map((i) => <SkeletonCard key={i} height="h-14" />)
      ) : error ? (
        <EmptyState onRack title={t('unavailable')} description={error} />
      ) : sessions.length === 0 ? (
        <EmptyState onRack title={t('noneRunning')} description={t('noneRunningHint')} />
      ) : (
        sessions.map((session) => <ActiveSessionRow key={session.key} session={session} />)
      )}
    </RackSection>
  )
}

function ActiveSessionRow({ session }: { session: ActiveSession }) {
  const t = useTranslations('sessionsPage')
  const locale = useLocale()
  const isLive = session.status === 'live'

  return (
    <Strip kind="agent" quiet={!isLive}>
      <Link
        href={sessionHref(session.key, session.instanceId)}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 no-underline text-foreground group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent rounded-[2px]"
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold text-agent-ink truncate">
              {session.agentName || session.agentId}
            </span>
            {session.label && <span className="text-sm truncate">{session.label}</span>}
          </div>
          <div className="flex items-baseline gap-2 text-mid text-muted min-w-0 mt-0.5">
            <span className={cn('shrink-0', isLive ? 'text-agent-ink' : 'text-muted')}>
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-[1px]',
                  isLive ? 'bg-agent motion-safe:animate-pulse' : 'bg-border',
                )}
              />
              {t(`status.${session.status}`)}
            </span>
            {session.currentAction && <span className="truncate">{session.currentAction}</span>}
            {!session.currentAction && session.recentTools.length > 0 && (
              <span className="truncate font-mono text-xs">{session.recentTools.join(' · ')}</span>
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-4 text-mid text-muted tabular-nums whitespace-nowrap self-center">
          {session.model && (
            <span className="hidden md:inline font-mono text-xs">
              {session.model.split('/').pop()}
            </span>
          )}
          {session.totalTokens ? <span>{formatTokens(session.totalTokens)}</span> : null}
          <span className="text-foreground/80">
            {session.estimatedCostUsd ? formatUsd(locale, session.estimatedCostUsd) : '—'}
          </span>
          <span className="hidden sm:inline">{session.lastActivityAgo}</span>
          <ArrowUpRight
            size={15}
            className="text-muted group-hover:text-foreground self-center"
            aria-label={t('openTranscript')}
          />
        </div>
      </Link>
    </Strip>
  )
}
