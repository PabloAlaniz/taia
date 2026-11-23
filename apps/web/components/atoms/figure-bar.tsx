import { cn } from '../../lib/utils'

export interface FigureBarSegment {
  value: number
  /** Fill class: a participant hue (`bg-agent`, `bg-person`) or a neutral. */
  className: string
  /** Hover text; the figure itself is always written next to the bar. */
  title?: string
}

export interface FigureBarProps {
  segments: FigureBarSegment[]
  /** The value that fills the whole track. */
  max: number
  className?: string
}

/**
 * A quiet inline bar for a row of figures: a hairline-thin track with the
 * figure's share filled in. Decoration only (aria-hidden): the number it
 * draws is always printed beside it.
 */
export function FigureBar({ segments, max, className }: FigureBarProps) {
  const total = Math.max(max, 1)
  return (
    <span
      aria-hidden="true"
      className={cn('flex h-1.5 overflow-hidden rounded-[1px] bg-strip-done', className)}
    >
      {segments.map((seg, i) =>
        seg.value > 0 ? (
          <span
            key={i}
            title={seg.title}
            className={cn('h-full', seg.className)}
            style={{ width: `${Math.min(100, (seg.value / total) * 100)}%` }}
          />
        ) : null,
      )}
    </span>
  )
}
