'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp, ChevronsUp, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'

const ICONS = { LOW: ChevronDown, MEDIUM: Minus, HIGH: ChevronUp, URGENT: ChevronsUp } as const

/**
 * Priority as a glyph and a word, in ink. Hue stays with participants and
 * waiting (orange) and with failures (red): only "urgente" earns the alert ink.
 */
export function PriorityMark({
  priority,
  withLabel = true,
  className,
}: {
  priority: string
  withLabel?: boolean
  className?: string
}) {
  const t = useTranslations('priority')
  const key = (priority in ICONS ? priority : 'MEDIUM') as keyof typeof ICONS
  const Icon = ICONS[key]
  const label = t(key)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold',
        key === 'URGENT' ? 'text-alert' : key === 'LOW' ? 'text-muted' : 'text-foreground',
        className,
      )}
      title={withLabel ? undefined : label}
    >
      <Icon size={13} aria-hidden="true" />
      {withLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  )
}
