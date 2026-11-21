'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { ActiveSession } from '@taia/types'
import { api } from '@/lib/api'
import { useResource } from '@/lib/use-resource'
import { cn, sessionHref } from '../../lib/utils'
import { Badge } from '../atoms'
import { Card, SkeletonCard, EmptyState } from '../molecules'

interface ActiveSessionsGridProps {
  onSessionCount?: (count: number) => void
}

export function ActiveSessionsGrid({ onSessionCount }: ActiveSessionsGridProps) {
  const tr = useTranslations('runtime')
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

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} height="h-28" />
        ))}
      </div>
    )
  }

  if (error) {
    return <EmptyState icon="⚠️" title={tr('unavailable')} description={error} className="p-8" />
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon="😴"
        title="No hay agentes activos"
        description="Las sesiones activas aparecen aqui automaticamente"
        className="p-8"
      />
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {sessions.map((session) => (
        <ActiveSessionCard key={session.key} session={session} />
      ))}
    </div>
  )
}

function ActiveSessionCard({ session }: { session: ActiveSession }) {
  const isLive = session.status === 'live'

  return (
    <Link href={sessionHref(session.key, session.instanceId)} className="no-underline">
      <Card variant="interactive" padding="sm" className="h-full">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-xl">{session.agentAvatar || '🤖'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs truncate text-foreground">
              {session.agentName || session.agentId}
            </div>
            {session.label && <div className="text-2xs text-muted truncate">{session.label}</div>}
          </div>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isLive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500',
              )}
            />
            <span className={cn('text-2xs', isLive ? 'text-green-400' : 'text-yellow-400')}>
              {session.status}
            </span>
          </div>
        </div>

        {/* Model + tokens */}
        <div className="flex items-center gap-2 mb-2">
          {session.model && (
            <Badge variant="secondary" size="xs">
              {session.model.split('/').pop()}
            </Badge>
          )}
          {session.totalTokens && (
            <span className="text-2xs text-muted">
              {formatTokensShort(session.totalTokens)} tokens
            </span>
          )}
          {session.estimatedCostUsd !== undefined && session.estimatedCostUsd > 0 && (
            <span className="text-2xs text-muted">${session.estimatedCostUsd.toFixed(3)}</span>
          )}
        </div>

        {/* Current action */}
        {session.currentAction && (
          <div className="text-2xs text-orange-300 mb-1 truncate">{session.currentAction}</div>
        )}

        {/* Recent tools */}
        {session.recentTools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {session.recentTools.map((tool, i) => (
              <Badge key={i} variant="muted" size="xs">
                🔧 {tool}
              </Badge>
            ))}
          </div>
        )}

        {/* Message preview */}
        {session.messagePreview && (
          <div className="text-2xs text-muted leading-tight mt-1 truncate">
            {session.messagePreview}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center mt-3 pt-2 border-t border-border text-2xs text-muted">
          <span>{session.lastActivityAgo}</span>
          <span className="text-accent">Ver transcript →</span>
        </div>
      </Card>
    </Link>
  )
}

function formatTokensShort(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}
