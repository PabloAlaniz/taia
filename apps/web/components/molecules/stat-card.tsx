import { cn } from '../../lib/utils'

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

/** A number on a strip: sits in a rack next to its siblings. Zero reads quiet. */
export function StatCard({ label, value, tone = 'default', size = 'default' }: StatCardProps) {
  const zero = value === 0 || value === '0'
  return (
    <div className="rounded-[2px] bg-strip px-3.5 py-3 shadow-[0_1px_0_rgba(0,0,0,0.25)]">
      <div className="text-xs font-semibold tracking-[0.08em] uppercase text-muted">{label}</div>
      <div
        className={cn(
          'mt-1.5 font-semibold tabular-nums leading-none',
          size === 'hero' ? 'text-4xl' : 'text-3xl',
          zero && 'text-muted font-medium',
          !zero && tone === 'alert' && 'text-alert',
          !zero && tone === 'waiting' && 'text-person-ink',
        )}
      >
        {value}
      </div>
    </div>
  )
}
