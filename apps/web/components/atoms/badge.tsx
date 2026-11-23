import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'muted' | 'secondary' | 'success' | 'warning' | 'danger'
  size?: 'xs' | 'sm'
  /** Custom background color (hex). When set, overrides variant styling. */
  color?: string
}

const variants = {
  default: 'bg-background text-muted',
  accent: 'bg-foreground text-background',
  muted: 'bg-card text-muted',
  secondary: 'bg-card border border-border text-foreground',
  // State badges: ink-strength text with a ring, no fill, so they read on any
  // surface (page, card, strip) in both themes.
  success: 'text-ok ring-1 ring-inset ring-ok/50',
  warning: 'text-person-ink ring-1 ring-inset ring-person/60',
  danger: 'text-alert ring-1 ring-inset ring-alert/50',
}

const sizes = {
  xs: 'text-xxs px-1.5 py-0.5 leading-tight',
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
  // A tag colour tints the chip and marks it with a dot; the text stays ink so
  // it reads on any strip, whatever colour the user picked.
  const colorStyle = color ? { backgroundColor: `${color}26`, ...style } : style

  return (
    <span
      className={cn(
        'rounded-sm font-semibold inline-flex items-center',
        color ? 'text-foreground gap-1.5' : variants[variant],
        sizes[size],
        className,
      )}
      style={colorStyle}
      {...props}
    >
      {color && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {props.children}
    </span>
  )
}
