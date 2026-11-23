import { cn } from '../../lib/utils'

export type StripKind = 'agent' | 'person' | 'none'

export interface StripProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Edge tab colour: who holds this row; `none` draws no tab. */
  kind?: StripKind
  /** Pulled out of the rack: a person has to act on it. */
  waiting?: boolean
  /** Muted: finished, offline or disabled. */
  quiet?: boolean
}

/**
 * The flight strip: a pale row with a coloured edge tab. Board cards, roster
 * rows, sessions and projects are all strips, so they read as one system.
 */
export function Strip({
  kind = 'none',
  waiting,
  quiet,
  className,
  children,
  ...props
}: StripProps) {
  return (
    <div
      className={cn(
        'relative rounded-[2px] pl-4 pr-3 py-2',
        waiting
          ? 'bg-card shadow-[0_0_0_1px_var(--person),0_6px_14px_rgba(0,0,0,0.3)]'
          : quiet
            ? 'bg-strip-done shadow-[0_1px_0_rgba(0,0,0,0.25)]'
            : 'bg-strip shadow-[0_1px_0_rgba(0,0,0,0.25)]',
        className,
      )}
      {...props}
    >
      {kind !== 'none' && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-0 left-0 w-[5px] rounded-l-[2px]',
            kind === 'agent' ? 'bg-agent' : 'bg-person',
          )}
        />
      )}
      {children}
    </div>
  )
}
