/**
 * The TAIA mark: a mate with its bombilla, drawn in the same stroke as the
 * icon set. Inherits `currentColor`.
 */
export function MateMark({
  size = 20,
  className,
  title,
}: {
  size?: number
  className?: string
  /** Accessible name; omit when a visible wordmark sits next to it. */
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* gourd */}
      <path d="M7.6 9C5.2 10.6 4.4 14.6 5.9 17.8 7.1 20.3 9.4 21.5 12 21.5s4.9-1.2 6.1-3.7c1.5-3.2.7-7.2-1.7-8.8" />
      {/* virola (the metal rim) */}
      <rect x="7" y="6.6" width="10" height="2.4" rx="1.1" />
      {/* yerba */}
      <path d="M8.7 6.6c.9-1.3 2.6-1.6 3.9-.7" />
      {/* bombilla */}
      <path d="M13.6 6.6 17 2.4h2" />
    </svg>
  )
}
