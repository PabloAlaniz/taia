import { cn } from '../../lib/utils'

export interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  size?: 'xs' | 'sm'
}

const sizes = {
  xs: 'text-3xs',
  sm: 'text-2xs',
}

export function Code({ size = 'xs', className, ...props }: CodeProps) {
  return (
    <code
      className={cn(
        'text-muted bg-background px-1 py-0.5 rounded-sm font-mono',
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
