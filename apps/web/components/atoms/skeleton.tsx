import { cn } from '../../lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string
  height?: string
}

export function Skeleton({ width = 'w-full', height = 'h-3', className, ...props }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse bg-card rounded-sm', width, height, className)} {...props} />
  )
}
