import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'

export const createWorktreeTool: ToolDefinition = {
  name: 'taia_create_worktree',
  description: 'Create a git worktree for a task, isolating work in a separate branch',
  params: {
    task_id: z.string().describe('The task ID to create a worktree for'),
    base_branch: z.string().optional().describe('Base branch (default: main)'),
  },
  handler: async ({ task_id, base_branch }) => {
    const { createWorktree } = await import('@taia/core/services/worktree.service')
    const worktree = await createWorktree({ task_id, base_branch, created_by: 'mcp' })
    return {
      created: true,
      worktree: {
        id: worktree.id,
        branch_name: worktree.branch_name,
        worktree_path: worktree.worktree_path,
        status: worktree.status,
      },
    }
  },
}

export const worktreeStatusTool: ToolDefinition = {
  name: 'taia_worktree_status',
  description: 'Get the active worktree status for a task',
  params: {
    task_id: z.string().describe('The task ID to check'),
  },
  handler: async ({ task_id }) => {
    const { getActiveWorktreeForTask } = await import('@taia/core/services/worktree.service')
    const worktree = await getActiveWorktreeForTask(task_id)
    if (!worktree) return { active: false, worktree: null }
    return {
      active: true,
      worktree: {
        id: worktree.id,
        branch_name: worktree.branch_name,
        worktree_path: worktree.worktree_path,
        status: worktree.status,
        base_branch: worktree.base_branch,
        merge_strategy: worktree.merge_strategy,
        diff_stats: worktree.diff_stats,
      },
    }
  },
}

export const worktreeDiffTool: ToolDefinition = {
  name: 'taia_worktree_diff',
  description: 'Get the diff (changes) for an active worktree',
  params: {
    task_id: z.string().describe('The task ID to get diff for'),
  },
  handler: async ({ task_id }) => {
    const { getActiveWorktreeForTask, getWorktreeDiff } = await import(
      '@taia/core/services/worktree.service'
    )
    const worktree = await getActiveWorktreeForTask(task_id)
    if (!worktree) throw new Error('No active worktree for this task')
    const diff = await getWorktreeDiff(worktree.id)
    return {
      stats: diff.stats,
      commits: diff.commits,
      unified_diff_length: diff.unified_diff.length,
      unified_diff: diff.unified_diff.slice(0, 10000),
    }
  },
}

export const mergeWorktreeTool: ToolDefinition = {
  name: 'taia_merge_worktree',
  description: 'Merge the active worktree for a task back into the base branch',
  params: {
    task_id: z.string().describe('The task ID to merge'),
    strategy: z
      .enum(['merge', 'squash', 'rebase'])
      .optional()
      .describe('Merge strategy (default: squash)'),
  },
  handler: async ({ task_id, strategy }) => {
    const { getActiveWorktreeForTask, mergeWorktree } = await import(
      '@taia/core/services/worktree.service'
    )
    const worktree = await getActiveWorktreeForTask(task_id)
    if (!worktree) throw new Error('No active worktree for this task')
    const merged = await mergeWorktree(worktree.id, { strategy: strategy as never })
    return {
      merged: true,
      worktree: { id: merged.id, branch_name: merged.branch_name, status: merged.status },
    }
  },
}

export const worktreeTools: ToolDefinition[] = [
  createWorktreeTool,
  worktreeStatusTool,
  worktreeDiffTool,
  mergeWorktreeTool,
]
