'use client'

import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import type { ActiveSession, Worktree } from '@taia/types'
import { api, type ApprovalRequest } from './api'
import { useStore } from './store'
import { collectWaiting } from './waiting'

const POLL_MS = 15_000

/** Window event: something waiting on a person was just resolved. */
export const WAITING_CHANGED = 'taia:waiting-changed'

export function announceWaitingChanged() {
  window.dispatchEvent(new Event(WAITING_CHANGED))
}

interface LiveState {
  approvals: ApprovalRequest[]
  worktrees: Worktree[]
  /** Sessions the runtime reports as running now; empty in standalone. */
  liveSessions: ActiveSession[]
  /** USD spent in the last 24 hours, or null while unknown. */
  costToday: number | null
  load: () => Promise<void>
  dropApproval: (id: string) => void
}

/**
 * One source for what's live: pending approvals, worktrees, running sessions
 * and today's spend. The top bar polls it; the board reads the same data, so
 * their counts can't disagree.
 */
export const useLiveStore = create<LiveState>((set) => ({
  approvals: [],
  worktrees: [],
  liveSessions: [],
  costToday: null,
  load: async () => {
    const [a, w, s, c] = await Promise.all([
      api.approvals.pending().catch(() => null),
      api.worktrees.list().catch(() => null),
      api.sessions.active().catch(() => null),
      api.cost.dashboard('24h').catch(() => null),
    ])
    set((prev) => ({
      approvals: a?.ok ? a.approvals : prev.approvals,
      worktrees: w?.ok ? w.worktrees : prev.worktrees,
      liveSessions: s?.ok ? (s.active ?? []).filter((x) => x.status === 'live') : [],
      costToday: c?.ok ? c.metrics.totals.total_cost_usd : prev.costToday,
    }))
  },
  dropApproval: (id) => set((prev) => ({ approvals: prev.approvals.filter((x) => x.id !== id) })),
}))

/** Mount once (the top bar does): keeps the live store fresh. */
export function useLivePoller() {
  const load = useLiveStore((s) => s.load)
  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    window.addEventListener(WAITING_CHANGED, load)
    return () => {
      clearInterval(timer)
      window.removeEventListener(WAITING_CHANGED, load)
    }
  }, [load])
}

/** What waits on a person in the active workspace, by task id. */
export function useWaiting() {
  const tasks = useStore((s) => s.tasks)
  const agents = useStore((s) => s.agents)
  const approvals = useLiveStore((s) => s.approvals)
  const worktrees = useLiveStore((s) => s.worktrees)
  return useMemo(
    () => collectWaiting(tasks, agents, approvals, worktrees),
    [tasks, agents, approvals, worktrees],
  )
}
