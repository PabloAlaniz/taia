import { cn } from '../../lib/utils'
import { Skeleton } from '../atoms/skeleton'
import { Card } from './card'

export interface SkeletonCardProps {
  lines?: number
  height?: string
  className?: string
}

const lineWidths = ['w-1/3', 'w-1/2', 'w-2/3', 'w-1/4', 'w-3/4']

export function SkeletonCard({ lines = 2, height = 'h-16', className }: SkeletonCardProps) {
  return (
    <Card padding="sm" className={cn('animate-pulse', height, className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={lineWidths[i % lineWidths.length]}
          height={i === 0 ? 'h-3' : 'h-2'}
          className={i > 0 ? 'mt-2' : ''}
        />
      ))}
    </Card>
  )
}
