import { cn } from '../../lib/utils'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('py-8 text-center', className)}>
      {icon && <div className="text-3xl mb-2">{icon}</div>}
      <p className="text-sm text-muted">{title}</p>
      {description && <p className="text-xs text-muted mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
