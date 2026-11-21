import { cn } from '../../lib/utils'

export interface ProgressBarSegment {
  percent: number
  color: string
}

export interface ProgressBarProps {
  segments: ProgressBarSegment[]
  className?: string
}

export function ProgressBar({ segments, className }: ProgressBarProps) {
  return (
    <div className={cn('h-1.5 bg-background rounded-full overflow-hidden flex', className)}>
      {segments.map((seg, i) => (
        <div key={i} className={cn('h-full', seg.color)} style={{ width: `${seg.percent}%` }} />
      ))}
    </div>
  )
}
