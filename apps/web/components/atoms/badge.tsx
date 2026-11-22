import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'muted' | 'secondary' | 'success' | 'warning' | 'danger'
  size?: 'xs' | 'sm'
  /** Custom background color (hex). When set, overrides variant styling. */
  color?: string
}

const variants = {
  default: 'bg-background text-muted',
  accent: 'bg-agent-ink text-white dark:text-rack-deep',
  muted: 'bg-card text-muted',
  secondary: 'bg-card border border-border text-foreground',
  success: 'bg-ok/15 text-ok',
  warning: 'bg-person/20 text-person-ink',
  danger: 'bg-alert/15 text-alert',
}

const sizes = {
  xs: 'text-2xs px-2 py-1 leading-none',
  sm: 'text-xs px-2.5 py-1 leading-none',
}

export function Badge({
  variant = 'default',
  size = 'xs',
  color,
  className,
  style,
  ...props
}: BadgeProps) {
  const colorStyle = color
    ? {
        backgroundColor: `${color}25`,
        color: color,
        ...style,
      }
    : style

  return (
    <span
      className={cn(
        'rounded-sm font-semibold inline-flex items-center',
        !color && variants[variant],
        sizes[size],
        className,
      )}
      style={colorStyle}
      {...props}
    />
  )
}
