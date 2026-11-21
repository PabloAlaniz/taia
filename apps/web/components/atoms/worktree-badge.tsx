import { Badge } from './badge'
import type { WorktreeStatus } from '@taia/types'

const STATUS_CONFIG: Record<
  WorktreeStatus,
  {
    variant: 'default' | 'accent' | 'muted' | 'secondary' | 'success' | 'warning' | 'danger'
    label: string
  }
> = {
  creating: { variant: 'accent', label: 'Creating' },
  active: { variant: 'success', label: 'Active' },
  reviewing: { variant: 'warning', label: 'Reviewing' },
  merging: { variant: 'warning', label: 'Merging' },
  merged: { variant: 'muted', label: 'Merged' },
  failed: { variant: 'danger', label: 'Failed' },
  cleanup: { variant: 'muted', label: 'Cleanup' },
}

export interface WorktreeBadgeProps {
  status: WorktreeStatus
  className?: string
}

export function WorktreeBadge({ status, className }: WorktreeBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.active
  return (
    <Badge variant={config.variant} size="sm" className={className}>
      {config.label}
    </Badge>
  )
}
