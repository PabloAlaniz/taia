import { cn } from '../../lib/utils'

export interface EmptyStateProps {
  /** A lucide icon element; emoji strings are ignored. */
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  /** On a graphite rack instead of the page. */
  onRack?: boolean
}

/** Says why it's empty and what to do next; never just "nothing here". */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  onRack,
}: EmptyStateProps) {
  const drawn = icon && typeof icon !== 'string' ? icon : null
  return (
    <div className={cn('py-8 px-4 flex flex-col items-start gap-1.5 max-w-prose', className)}>
      {drawn && (
        <div className={cn('mb-1', onRack ? 'text-on-rack-muted' : 'text-muted')}>{drawn}</div>
      )}
      <p
        className={cn('text-base font-semibold', onRack ? 'text-rack-heading' : 'text-foreground')}
      >
        {title}
      </p>
      {description && (
        <p className={cn('text-sm leading-relaxed', onRack ? 'text-on-rack-muted' : 'text-muted')}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
