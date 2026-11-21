import { cn } from '../../lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'selected'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variants = {
  default: 'bg-card border border-border',
  interactive: 'bg-card border border-border cursor-pointer hover:border-accent transition-colors',
  selected: 'bg-card border border-accent ring-2 ring-accent',
}

const paddings = {
  none: '',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({ variant = 'default', padding = 'sm', className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg shadow-xs shadow-black/10',
        variants[variant],
        paddings[padding],
        className,
      )}
      {...props}
    />
  )
}
