/**
 * Worktree Listener — auto-creates worktree when a task is assigned (if enabled)
 */

import { eventBus } from '../event-bus'

export function registerWorktreeListeners(): void {
  eventBus.on(
    'task:assigned',
    async (e) => {
      const { getWorktreeConfig } = await import('../../services/worktree-config')
      const wtConfig = await getWorktreeConfig()
      if (!wtConfig.autoCreateOnAssign) return

      const task = e.payload.task as { id: string; repo_url?: string; primary_repo_url?: string }
      if (!task.repo_url && !task.primary_repo_url) return

      try {
        const { createWorktree } = await import('../../services/worktree.service')
        await createWorktree({
          task_id: task.id,
          created_by: e.payload.agentId as string,
        })
      } catch {
        console.warn(`[WorktreeAutoCreate] Failed for task ${task.id}, continuing assignment`)
      }
    },
    { id: 'worktree:task-assigned' },
  )
}
