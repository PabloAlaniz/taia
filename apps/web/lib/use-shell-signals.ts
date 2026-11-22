'use client'

import { useEffect, useState } from 'react'
import { api } from './api'

const POLL_MS = 30_000

/** Window event: something waiting on a person was just resolved. */
export const WAITING_CHANGED = 'taia:waiting-changed'

export function announceWaitingChanged() {
  window.dispatchEvent(new Event(WAITING_CHANGED))
}

export interface ShellSignals {
  /** Paused tool calls plus worktrees ready to merge, across the instance. */
  waitingCount: number | null
  /** USD spent in the last 24 hours. */
  costToday: number | null
}

/** What the top bar shows on every page: what waits on a person, and today's spend. */
export function useShellSignals(): ShellSignals {
  const [signals, setSignals] = useState<ShellSignals>({ waitingCount: null, costToday: null })

  useEffect(() => {
    let cancelled = false
    const load = () => {
      Promise.all([
        api.approvals.pending().catch(() => null),
        api.worktrees.list().catch(() => null),
        api.cost.dashboard('24h').catch(() => null),
      ]).then(([a, w, c]) => {
        if (cancelled) return
        const approvals = a?.ok ? a.approvals.length : 0
        const merges = w?.ok ? w.worktrees.filter((wt) => wt.status === 'reviewing').length : 0
        setSignals({
          waitingCount: a?.ok || w?.ok ? approvals + merges : null,
          costToday: c?.ok ? c.metrics.totals.total_cost_usd : null,
        })
      })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    // Pages that resolve something (an approval, a merge) say so right away.
    window.addEventListener(WAITING_CHANGED, load)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener(WAITING_CHANGED, load)
    }
  }, [])

  return signals
}
