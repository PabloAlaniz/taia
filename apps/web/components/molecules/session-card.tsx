'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Bot } from 'lucide-react'
import type { SessionListItem } from '@taia/types'
import { sessionHref } from '../../lib/utils'
import { formatTokens, formatUsd } from '../../lib/format'
import { Badge } from '../atoms'
import { Card } from './card'

type SessionStatus = 'live' | 'idle' | 'offline'

const STATUS_VARIANT: Record<SessionStatus, 'success' | 'warning' | 'muted'> = {
  live: 'success',
  idle: 'warning',
  offline: 'muted',
}

interface SessionCardProps {
  session: SessionListItem
}

export function SessionCard({ session }: SessionCardProps) {
  const t = useTranslations('sessionCard')
  const ts = useTranslations('sessionsPage.status')
  const locale = useLocale()
  const status: SessionStatus = session.status in STATUS_VARIANT ? session.status : 'offline'

  return (
    <Link href={sessionHref(session.key, session.instanceId)} className="no-underline">
      <Card variant="interactive" padding="sm" className="mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {session.agentAvatar || <Bot size={18} className="text-muted" aria-hidden="true" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs truncate text-foreground">
              {session.agentName || session.agentId}
            </div>
            {session.label && <div className="text-2xs text-muted truncate">{session.label}</div>}
          </div>
          <Badge variant={STATUS_VARIANT[status]} size="xs">
            {ts(status)}
          </Badge>
        </div>

        <div className="flex items-center justify-between mt-1.5 text-2xs text-muted">
          <div className="flex items-center gap-2">
            {session.model && (
              <Badge variant="secondary" size="xs">
                {session.model.split('/').pop()}
              </Badge>
            )}
            {session.totalTokens ? (
              <span>{t('tokens', { count: formatTokens(session.totalTokens) })}</span>
            ) : null}
            {session.estimatedCostUsd !== undefined && session.estimatedCostUsd > 0 && (
              <span>{formatUsd(locale, session.estimatedCostUsd)}</span>
            )}
          </div>
          <span>{session.lastActivityAgo}</span>
        </div>
      </Card>
    </Link>
  )
}
