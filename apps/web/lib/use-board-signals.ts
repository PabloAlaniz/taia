'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  /** Decisions queued for UNDO_MS before they are sent, by approval id. */
  pending: Record<string, PendingDecision>
  /** Queue a decision; it is sent after UNDO_MS unless undone. */
  queueDecision: (approvalId: string, decision: 'approved' | 'rejected', decidedBy: string) => void
  undoDecision: (approvalId: string) => void
  /** Errors from decisions already sent, by approval id. */
  decisionErrors: Record<string, string>
}

export interface PendingDecision {
  decision: 'approved' | 'rejected'
  /** epoch ms when it will be sent */
  sendAt: number
}

/** What a waiting strip needs to approve or reject in place. */
export interface ApprovalControls {
  pending: Record<string, PendingDecision>
  errors: Record<string, string>
  /** False until the person deciding is known (the user switcher). */
  canDecide: boolean
  queue: (approvalId: string, decision: 'approved' | 'rejected') => void
  undo: (approvalId: string) => void
}

/** How long an approval or rejection can be undone before it reaches the agent. */
export const UNDO_MS = 5_000

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

  // Decisions wait UNDO_MS so a slip can be undone; timers live here, not on
  // the strip, so a re-sorted or unmounted strip never loses a decision.
  const [pending, setPending] = useState<Record<string, PendingDecision>>({})
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>({})
  const timers = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => void }>(),
  )

  const queueDecision = useCallback(
    (approvalId: string, decision: 'approved' | 'rejected', decidedBy: string) => {
      const send = () => {
        timers.current.delete(approvalId)
        setPending(({ [approvalId]: _sent, ...rest }) => rest)
        decide(approvalId, decision, decidedBy).then((err) =>
          setDecisionErrors((prev) => {
            const { [approvalId]: _old, ...rest } = prev
            return err ? { ...rest, [approvalId]: err } : rest
          }),
        )
      }
      timers.current.set(approvalId, { timer: setTimeout(send, UNDO_MS), send })
      setPending((prev) => ({ ...prev, [approvalId]: { decision, sendAt: Date.now() + UNDO_MS } }))
    },
    [decide],
  )

  const undoDecision = useCallback((approvalId: string) => {
    const entry = timers.current.get(approvalId)
    if (entry) clearTimeout(entry.timer)
    timers.current.delete(approvalId)
    setPending(({ [approvalId]: _undone, ...rest }) => rest)
  }, [])

  // Leaving the board sends what was queued: the user already decided.
  useEffect(() => {
    const queued = timers.current
    return () => {
      for (const { timer, send } of queued.values()) {
        clearTimeout(timer)
        send()
      }
    }
  }, [])

  return {
    pending,
    queueDecision,
    undoDecision,
    decisionErrors,
    costs,
    waiting,
    waitingCount: Object.keys(waiting).length,
    running,
    liveAgents: new Set(liveSessions.map((s) => s.agentId)).size,
    decide,
  }
}
