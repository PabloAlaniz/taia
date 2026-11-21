import { cn } from '../../lib/utils'
import { Card } from './card'

export interface SectionCardProps {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
  className?: string
}

export function SectionCard({
  title,
  description,
  action,
  children,
  contentClassName,
  className,
}: SectionCardProps) {
  return (
    <Card padding="none" className={cn('rounded-lg', className)}>
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted mt-1">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn('p-4 space-y-4', contentClassName)}>{children}</div>
    </Card>
  )
}
