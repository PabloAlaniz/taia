'use client'

import { useTranslations } from 'next-intl'
import { Badge } from './badge'
import type { WorktreeStatus } from '@taia/types'

const STATUS_CONFIG: Record<
  WorktreeStatus,
  {
    variant: 'default' | 'accent' | 'muted' | 'secondary' | 'success' | 'warning' | 'danger'
  }
> = {
  creating: { variant: 'accent' },
  active: { variant: 'success' },
  reviewing: { variant: 'warning' },
  merging: { variant: 'warning' },
  merged: { variant: 'muted' },
  failed: { variant: 'danger' },
  cleanup: { variant: 'muted' },
}

export interface WorktreeBadgeProps {
  status: WorktreeStatus
  className?: string
}

export function WorktreeBadge({ status, className }: WorktreeBadgeProps) {
  const t = useTranslations('worktree.status')
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.active
  return (
    <Badge variant={config.variant} size="sm" className={className}>
      {t(STATUS_CONFIG[status] ? status : 'active')}
    </Badge>
  )
}
