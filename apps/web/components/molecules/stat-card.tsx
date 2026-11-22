import { cn } from '../../lib/utils'
import { Card } from './card'

export interface StatCardProps {
  label: string
  value: string | number
  /** @deprecated Emoji icons are gone; kept so callers compile. */
  icon?: string
  /** @deprecated Values are ink; colour is reserved for state. Use `tone`. */
  color?: string
  /** State colour, only when the number means something is wrong or waiting. */
  tone?: 'default' | 'alert' | 'waiting'
  size?: 'default' | 'hero'
}

export function StatCard({ label, value, tone = 'default', size = 'default' }: StatCardProps) {
  const isHero = size === 'hero'
  return (
    <Card padding={isHero ? 'lg' : 'md'}>
      <div className="text-xs font-semibold tracking-[0.08em] uppercase text-muted">{label}</div>
      <div
        className={cn(
          'mt-1.5 font-semibold tabular-nums leading-none',
          isHero ? 'text-4xl' : 'text-3xl',
          tone === 'alert' && 'text-alert',
          tone === 'waiting' && 'text-person-ink',
        )}
      >
        {value}
      </div>
    </Card>
  )
}
