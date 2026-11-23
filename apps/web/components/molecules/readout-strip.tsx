import Link from 'next/link'
import { cn } from '../../lib/utils'

export interface Readout {
  id: string
  /** The figure, already formatted. */
  value: string | number
  /** Lowercase words that finish the phrase: "3 te esperan". */
  label: string
  /**
   * `waiting` draws the figure as the orange waiting counter, `alert` in
   * failure ink; both only when the figure is not zero.
   */
  tone?: 'default' | 'alert' | 'waiting'
  /** A zero figure reads quiet. Defaults to value === 0. */
  zero?: boolean
  /** Where the readout leads (only when it is not zero). */
  href?: string
  /** Accessible name for the link, when the phrase alone is not enough. */
  linkLabel?: string
}

export interface ReadoutStripProps {
  items: Readout[]
  /** Names the group for assistive tech ("Ahora", "Ritmo de trabajo"). */
  label: string
  className?: string
}

/**
 * One strip that reads as a sentence of the shift: figure + words, cells
 * split by hairlines. Cells wrap onto more rows on narrow screens and every
 * row still fills the strip, so no hairline is left hanging.
 */
export function ReadoutStrip({ items, label, className }: ReadoutStripProps) {
  return (
    <ul
      aria-label={label}
      className={cn(
        'flex flex-wrap gap-px overflow-hidden rounded-[2px] bg-border shadow-[0_1px_0_rgba(0,0,0,0.25)]',
        className,
      )}
    >
      {items.map((item) => {
        const zero = item.zero ?? (item.value === 0 || item.value === '0')
        const figure = (
          <span
            className={cn(
              'shrink-0 whitespace-nowrap tabular-nums leading-none',
              zero ? 'text-2xl font-medium text-muted' : 'text-2xl font-semibold text-foreground',
              !zero && item.tone === 'alert' && 'text-alert',
              !zero &&
                item.tone === 'waiting' &&
                'rounded-[3px] bg-person px-1.5 py-0.5 text-xl font-bold text-on-person',
            )}
          >
            {item.value}
          </span>
        )
        const words = (
          <span
            className={cn(
              'min-w-0 text-mid leading-tight',
              !zero && item.tone === 'alert' ? 'text-alert' : 'text-muted',
            )}
          >
            {item.label}
          </span>
        )
        const body = (
          <>
            {figure}
            {words}
          </>
        )
        return (
          <li key={item.id} className="flex min-w-[9rem] flex-1 basis-[9rem] bg-strip">
            {item.href && !zero ? (
              <Link
                href={item.href}
                aria-label={item.linkLabel}
                className="flex w-full items-baseline gap-2 px-3.5 py-3 text-foreground no-underline hover:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                {body}
              </Link>
            ) : (
              <span className="flex w-full items-baseline gap-2 px-3.5 py-3">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
