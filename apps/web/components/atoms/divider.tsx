import { cn } from '../../lib/utils'

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg' | 'full'
}

const verticalSizes = {
  sm: 'h-3',
  md: 'h-4',
  lg: 'h-5',
  full: 'flex-1',
}

const horizontalSizes = {
  sm: 'w-8',
  md: 'w-16',
  lg: 'w-32',
  full: 'w-full',
}

export function Divider({
  orientation = 'vertical',
  size = 'md',
  className,
  ...props
}: DividerProps) {
  const isVertical = orientation === 'vertical'

  return (
    <div
      role="separator"
      aria-hidden="true"
      className={cn(
        'bg-border',
        isVertical ? 'w-px' : 'h-px',
        isVertical ? verticalSizes[size] : horizontalSizes[size],
        className,
      )}
      {...props}
    />
  )
}
