import Link from 'next/link'
import { cn } from '../../lib/utils'

export interface PageHeaderProps {
  title: string
  icon?: string
  backHref?: string
  backLabel?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  icon,
  backHref = '/',
  backLabel,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'h-12 bg-card border-b border-border flex items-center justify-between px-4 shrink-0',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-muted hover:text-foreground no-underline">
          {backLabel ?? '←'}
        </Link>
        <h1 className="text-base font-bold">
          {icon && <>{icon} </>}
          {title}
        </h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  )
}
