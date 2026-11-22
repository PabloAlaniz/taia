import { cn } from '../../lib/utils'

export interface RackSectionProps {
  title: string
  count?: number
  /** Right side of the header: a total, a filter, an action. */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** id for the heading, so the section can be labelled by it. */
  id?: string
}

/**
 * A graphite rack holding strips: the board's bay, laid flat for lists. The
 * header is the rack's label; rows sit inside with the same rhythm as cards.
 */
export function RackSection({ title, count, aside, children, className, id }: RackSectionProps) {
  const headingId = id ?? `rack-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section
      aria-labelledby={headingId}
      className={cn('bg-rack rounded-md overflow-hidden', className)}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-5 pr-3 py-2.5 border-b border-rack-line text-on-rack">
        <h2
          id={headingId}
          className="text-sm font-semibold tracking-[0.08em] uppercase text-[#eef1f3]"
        >
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-sm font-medium tabular-nums text-on-rack-muted">{count}</span>
        )}
        {aside && (
          <div className="ml-auto flex items-center gap-3 text-mid text-on-rack-muted">{aside}</div>
        )}
      </header>
      <div className="flex flex-col gap-1.5 pl-5 pr-3 py-3">{children}</div>
    </section>
  )
}
