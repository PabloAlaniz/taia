'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Seconds left before a queued decision is sent, ticking, with a hairline
 * that drains. The number is announced politely only when it changes by a
 * whole second, so screen readers aren't flooded.
 */
export function UndoCountdown({ sendAt, total }: { sendAt: number; total: number }) {
  const t = useTranslations('taskCard')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])
  const left = Math.max(0, sendAt - now)
  const seconds = Math.ceil(left / 1000)
  return (
    <span className="inline-flex flex-col gap-1 min-w-24">
      <span className="text-xs text-muted tabular-nums">{t('sendsIn', { seconds })}</span>
      <span
        aria-hidden="true"
        className="block h-0.5 w-full bg-border rounded-full overflow-hidden"
      >
        <span className="block h-full bg-person" style={{ width: `${(left / total) * 100}%` }} />
      </span>
    </span>
  )
}
