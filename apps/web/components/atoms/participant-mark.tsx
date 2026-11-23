import { cn } from '../../lib/utils'

/**
 * The strip's edge tab in miniature: cyan for an agent, orange for a person.
 * Replaces emoji avatars wherever a participant is named.
 */
export function ParticipantMark({
  agent,
  className,
}: {
  agent?: { type?: string } | null
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block w-1 h-3 rounded-[1px] shrink-0 align-[-1px]',
        agent?.type === 'human' ? 'bg-person' : 'bg-agent',
        className,
      )}
    />
  )
}
