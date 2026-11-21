'use client'

import Link from 'next/link'
import type { SessionListItem } from '@taia/types'
import { sessionHref } from '../../lib/utils'
import { Badge } from '../atoms'
import { Card } from './card'

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'muted'; label: string }> = {
  live: { variant: 'success', label: '🟢 live' },
  idle: { variant: 'warning', label: '🟡 idle' },
  offline: { variant: 'muted', label: '⚪ offline' },
}

interface SessionCardProps {
  session: SessionListItem
}

export function SessionCard({ session }: SessionCardProps) {
  const statusCfg = STATUS_BADGE[session.status] || STATUS_BADGE.offline

  return (
    <Link href={sessionHref(session.key, session.instanceId)} className="no-underline">
      <Card variant="interactive" padding="sm" className="mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{session.agentAvatar || '🤖'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs truncate text-foreground">
              {session.agentName || session.agentId}
            </div>
            {session.label && <div className="text-2xs text-muted truncate">{session.label}</div>}
          </div>
          <Badge variant={statusCfg.variant} size="xs">
            {statusCfg.label}
          </Badge>
        </div>

        <div className="flex items-center justify-between mt-1.5 text-2xs text-muted">
          <div className="flex items-center gap-2">
            {session.model && (
              <Badge variant="secondary" size="xs">
                {session.model.split('/').pop()}
              </Badge>
            )}
            {session.totalTokens && <span>{formatTokensShort(session.totalTokens)} tokens</span>}
            {session.estimatedCostUsd !== undefined && session.estimatedCostUsd > 0 && (
              <span>${session.estimatedCostUsd.toFixed(3)}</span>
            )}
          </div>
          <span>{session.lastActivityAgo}</span>
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
