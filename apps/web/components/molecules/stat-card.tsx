import { cn } from '../../lib/utils'
import { Card } from './card'

export interface StatCardProps {
  label: string
  value: string | number
  icon: string
  color?: string
  size?: 'default' | 'hero'
}

export function StatCard({
  label,
  value,
  icon,
  color = 'text-foreground',
  size = 'default',
}: StatCardProps) {
  const isHero = size === 'hero'
  return (
    <Card padding={isHero ? 'lg' : 'md'} className="rounded-lg">
      <div className={cn('flex items-center gap-2', isHero ? 'mb-3' : 'mb-2')}>
        <span>{icon}</span>
        <span className={cn('text-muted', isHero ? 'text-sm' : 'text-xs')}>{label}</span>
      </div>
      <div className={cn('font-bold', isHero ? 'text-3xl' : 'text-2xl', color)}>{value}</div>
    </Card>
  )
}
