import { cn } from '../../lib/utils'

export type StatusDotColor = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: StatusDotColor
  pulse?: boolean
  glow?: boolean
  size?: 'sm' | 'md'
}

const colors = {
  green: 'bg-ok',
  yellow: 'bg-person',
  red: 'bg-alert',
  gray: 'bg-muted',
  blue: 'bg-agent',
}

// A soft offset ring instead of a zero-offset glow.
const glowColors = {
  green: 'ring-2 ring-ok/25',
  yellow: 'ring-2 ring-person/25',
  red: 'ring-2 ring-alert/25',
  gray: '',
  blue: 'ring-2 ring-agent/25',
}

const sizes = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
}

export function StatusDot({
  color = 'gray',
  pulse = false,
  glow = false,
  size = 'md',
  className,
  ...props
}: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rounded-full inline-block',
        colors[color],
        glow && glowColors[color],
        pulse && 'animate-pulse',
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
