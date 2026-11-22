'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task } from '@taia/types'
import { api } from './api'
import { announceWaitingChanged, useLiveStore, useWaiting } from './use-shell-signals'
import type { WaitingReason } from './waiting'

export type { WaitingReason } from './waiting'
export { collectWaiting, taskForApproval } from './waiting'

const POLL_MS = 15_000

export interface BoardSignals {
  /** USD per task, summed over its sessions. Absent means no sessions. */
  costs: Record<string, number>
  /** What waits on a person, by task id (same source as the top bar). */
  waiting: Record<string, WaitingReason>
  waitingCount: number
  /** Task ids with a session the runtime reports as running now. */
  running: Set<string>
  /** Distinct agents with a running session. */
  liveAgents: number
  /** Approve or reject a paused tool call. Returns an error code or null. */
  decide: (
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy?: string,
  ) => Promise<string | null>
}

export function useBoardSignals(tasks: Task[]): BoardSignals {
  const [costs, setCosts] = useState<Record<string, number>>({})
  const waiting = useWaiting()
  const liveSessions = useLiveStore((s) => s.liveSessions)
  const dropApproval = useLiveStore((s) => s.dropApproval)

  const idsKey = useMemo(
    () =>
      tasks
        .map((t) => t.id)
        .sort()
        .join(','),
    [tasks],
  )

  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    const load = () =>
      api.cost
        .forTasks(idsKey.split(','))
        .then((c) => !cancelled && c.ok && setCosts(c.costs))
        .catch(() => {})
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [idsKey])

  // Running means the runtime says so: a live session on the task, never just
  // "the task is in progress".
  const running = useMemo(() => {
    const ids = new Set<string>()
    for (const s of liveSessions) {
      const task = tasks.find((t) => t.session_key === s.key)
      if (task) ids.add(task.id)
    }
    return ids
  }, [liveSessions, tasks])

  const decide = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected', decidedBy?: string) => {
      try {
        const res = await api.approvals.decide(approvalId, decision, decidedBy)
        if (!res.ok) return res.error ?? 'error'
        dropApproval(approvalId)
        return null
      } catch {
        return 'network'
      } finally {
        announceWaitingChanged()
      }
    },
    [dropApproval],
  )

  return {
    costs,
    waiting,
    waitingCount: Object.keys(waiting).length,
    running,
    liveAgents: new Set(liveSessions.map((s) => s.agentId)).size,
    decide,
  }
}
