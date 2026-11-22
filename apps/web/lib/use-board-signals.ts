'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Agent, Task, Worktree } from '@taia/types'
import { api, type ApprovalRequest } from './api'
import { announceWaitingChanged } from './use-shell-signals'

const POLL_MS = 15_000

/** Why a strip is pulled forward: something only a person can resolve. */
export type WaitingReason =
  | { kind: 'approval'; approval: ApprovalRequest }
  | { kind: 'merge'; worktree: Worktree }
  | { kind: 'clarify' }

export interface BoardSignals {
  /** USD per task, summed over its sessions. Absent means no sessions. */
  costs: Record<string, number>
  /** What waits on a person, by task id. */
  waiting: Record<string, WaitingReason>
  waitingCount: number
  /** Approve or reject a paused tool call, then refresh. */
  decide: (
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy?: string,
  ) => Promise<string | null>
  refresh: () => void
}

/** The task an approval belongs to: by session, else the agent's current task. */
export function taskForApproval(
  approval: ApprovalRequest,
  tasks: Task[],
  agents: Agent[],
): Task | undefined {
  return (
    tasks.find((t) => t.session_key && t.session_key === approval.session_key) ??
    tasks.find((t) => t.id === agents.find((a) => a.id === approval.agent_id)?.currentTask)
  )
}

export function collectWaiting(
  tasks: Task[],
  agents: Agent[],
  approvals: ApprovalRequest[],
  worktrees: Worktree[],
): Record<string, WaitingReason> {
  const waiting: Record<string, WaitingReason> = {}
  for (const task of tasks) {
    if (task.tags?.includes('needs-clarification')) waiting[task.id] = { kind: 'clarify' }
  }
  for (const wt of worktrees) {
    if (wt.status === 'reviewing' && tasks.some((t) => t.id === wt.task_id)) {
      waiting[wt.task_id] = { kind: 'merge', worktree: wt }
    }
  }
  // An approval outranks the rest: the agent is paused until someone answers.
  for (const approval of approvals) {
    const task = taskForApproval(approval, tasks, agents)
    if (task) waiting[task.id] = { kind: 'approval', approval }
  }
  return waiting
}

export function useBoardSignals(tasks: Task[], agents: Agent[]): BoardSignals {
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [tick, setTick] = useState(0)

  const idsKey = useMemo(
    () =>
      tasks
        .map((t) => t.id)
        .sort()
        .join(','),
    [tasks],
  )

  useEffect(() => {
    let cancelled = false
    const load = () => {
      const ids = idsKey ? idsKey.split(',') : []
      Promise.all([
        ids.length ? api.cost.forTasks(ids).catch(() => null) : null,
        api.approvals.pending().catch(() => null),
        api.worktrees.list().catch(() => null),
      ]).then(([c, a, w]) => {
        if (cancelled) return
        if (c?.ok) setCosts(c.costs)
        if (a?.ok) setApprovals(a.approvals)
        if (w?.ok) setWorktrees(w.worktrees)
      })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [idsKey, tick])

  const waiting = useMemo(
    () => collectWaiting(tasks, agents, approvals, worktrees),
    [tasks, agents, approvals, worktrees],
  )

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  const decide = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected', decidedBy?: string) => {
      try {
        const res = await api.approvals.decide(approvalId, decision, decidedBy)
        if (!res.ok) return res.error ?? 'error'
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
        announceWaitingChanged()
        return null
      } catch {
        return 'network'
      } finally {
        refresh()
      }
    },
    [refresh],
  )

  return { costs, waiting, waitingCount: Object.keys(waiting).length, decide, refresh }
}
