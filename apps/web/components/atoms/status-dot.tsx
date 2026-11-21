import { cn } from '../../lib/utils'

export type StatusDotColor = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: StatusDotColor
  pulse?: boolean
  glow?: boolean
  size?: 'sm' | 'md'
}

const colors = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  gray: 'bg-muted',
  blue: 'bg-accent',
}

const glowColors = {
  green: 'shadow-[0_0_6px_#22c55e]',
  yellow: 'shadow-[0_0_6px_#eab308]',
  red: 'shadow-[0_0_6px_#ef4444]',
  gray: '',
  blue: 'shadow-[0_0_6px_#3b82f6]',
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
