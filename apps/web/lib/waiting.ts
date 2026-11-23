import type { Agent, Task, Worktree } from '@taia/types'
import type { ApprovalRequest } from './api'

/** Why a strip is pulled forward: something only a person can resolve. */
export type WaitingReason =
  | { kind: 'approval'; approval: ApprovalRequest }
  | { kind: 'merge'; worktree: Worktree }
  | { kind: 'clarify' }

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
