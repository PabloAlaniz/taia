import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'muted' | 'secondary' | 'success' | 'warning' | 'danger'
  size?: 'xs' | 'sm'
  /** Custom background color (hex). When set, overrides variant styling. */
  color?: string
}

const variants = {
  default: 'bg-background text-muted',
  accent: 'bg-accent text-white',
  muted: 'bg-card text-muted',
  secondary: 'bg-card border border-border text-foreground',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  danger: 'bg-red-500/20 text-red-400',
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
        'rounded-full font-medium inline-flex items-center',
        !color && variants[variant],
        sizes[size],
        className,
      )}
      style={colorStyle}
      {...props}
    />
  )
}
