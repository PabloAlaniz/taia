import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateWorktree = vi.fn()
const mockGetActiveWorktreeForTask = vi.fn()
const mockGetWorktreeDiff = vi.fn()
const mockMergeWorktree = vi.fn()

vi.mock('@taia/core/services/worktree.service', () => ({
  createWorktree: (...args: any[]) => mockCreateWorktree(...args),
  getActiveWorktreeForTask: (...args: any[]) => mockGetActiveWorktreeForTask(...args),
  getWorktreeDiff: (...args: any[]) => mockGetWorktreeDiff(...args),
  mergeWorktree: (...args: any[]) => mockMergeWorktree(...args),
}))

import {
  createWorktreeTool,
  worktreeStatusTool,
  worktreeDiffTool,
  mergeWorktreeTool,
  worktreeTools,
} from '../../src/tools/worktree-tools'

const SAMPLE_WORKTREE = {
  id: 'wt-1',
  branch_name: 'task/task-1',
  worktree_path: '/tmp/taia-worktrees/task-1',
  status: 'active',
  base_branch: 'main',
  merge_strategy: 'squash',
  diff_stats: { files_changed: 3, insertions: 42, deletions: 10 },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createWorktreeTool', () => {
  it('has correct name and description', () => {
    expect(createWorktreeTool.name).toBe('taia_create_worktree')
    expect(createWorktreeTool.description).toBeTruthy()
  })

  it('creates and returns worktree info', async () => {
    mockCreateWorktree.mockResolvedValue(SAMPLE_WORKTREE)

    const result = await createWorktreeTool.handler({ task_id: 'task-1' })

    expect(result).toEqual({
      created: true,
      worktree: {
        id: 'wt-1',
        branch_name: 'task/task-1',
        worktree_path: '/tmp/taia-worktrees/task-1',
        status: 'active',
      },
    })
    expect(mockCreateWorktree).toHaveBeenCalledWith({
      task_id: 'task-1',
      base_branch: undefined,
      created_by: 'mcp',
    })
  })
})

describe('worktreeStatusTool', () => {
  it('has correct name and description', () => {
    expect(worktreeStatusTool.name).toBe('taia_worktree_status')
    expect(worktreeStatusTool.description).toBeTruthy()
  })

  it('returns active worktree', async () => {
    mockGetActiveWorktreeForTask.mockResolvedValue(SAMPLE_WORKTREE)

    const result = await worktreeStatusTool.handler({ task_id: 'task-1' })

    expect(result).toEqual({
      active: true,
      worktree: {
        id: 'wt-1',
        branch_name: 'task/task-1',
        worktree_path: '/tmp/taia-worktrees/task-1',
        status: 'active',
        base_branch: 'main',
        merge_strategy: 'squash',
        diff_stats: { files_changed: 3, insertions: 42, deletions: 10 },
      },
    })
  })

  it('returns { active: false } when none', async () => {
    mockGetActiveWorktreeForTask.mockResolvedValue(null)

    const result = await worktreeStatusTool.handler({ task_id: 'task-99' })

    expect(result).toEqual({ active: false, worktree: null })
  })
})

describe('worktreeDiffTool', () => {
  it('has correct name and description', () => {
    expect(worktreeDiffTool.name).toBe('taia_worktree_diff')
    expect(worktreeDiffTool.description).toBeTruthy()
  })

  it('returns diff', async () => {
    mockGetActiveWorktreeForTask.mockResolvedValue(SAMPLE_WORKTREE)
    mockGetWorktreeDiff.mockResolvedValue({
      stats: { files_changed: 3, insertions: 42, deletions: 10 },
      commits: [{ sha: 'abc123', message: 'feat: add auth' }],
      unified_diff: 'diff --git a/file.ts b/file.ts\n+added line',
    })

    const result = await worktreeDiffTool.handler({ task_id: 'task-1' })

    expect(result).toEqual({
      stats: { files_changed: 3, insertions: 42, deletions: 10 },
      commits: [{ sha: 'abc123', message: 'feat: add auth' }],
      unified_diff_length: 42,
      unified_diff: 'diff --git a/file.ts b/file.ts\n+added line',
    })
    expect(mockGetWorktreeDiff).toHaveBeenCalledWith('wt-1')
  })

  it('throws when no worktree', async () => {
    mockGetActiveWorktreeForTask.mockResolvedValue(null)

    await expect(worktreeDiffTool.handler({ task_id: 'task-99' })).rejects.toThrow(
      'No active worktree for this task',
    )
  })
})

describe('mergeWorktreeTool', () => {
  it('has correct name and description', () => {
    expect(mergeWorktreeTool.name).toBe('taia_merge_worktree')
    expect(mergeWorktreeTool.description).toBeTruthy()
  })

  it('merges and returns result', async () => {
    mockGetActiveWorktreeForTask.mockResolvedValue(SAMPLE_WORKTREE)
    mockMergeWorktree.mockResolvedValue({
      id: 'wt-1',
      branch_name: 'task/task-1',
      status: 'merged',
    })

    const result = await mergeWorktreeTool.handler({ task_id: 'task-1' })

    expect(result).toEqual({
      merged: true,
      worktree: { id: 'wt-1', branch_name: 'task/task-1', status: 'merged' },
    })
    expect(mockMergeWorktree).toHaveBeenCalledWith('wt-1', { strategy: undefined })
  })

  it('throws when no worktree', async () => {
    mockGetActiveWorktreeForTask.mockResolvedValue(null)

    await expect(mergeWorktreeTool.handler({ task_id: 'task-99' })).rejects.toThrow(
      'No active worktree for this task',
    )
  })
})

describe('worktreeTools array', () => {
  it('has 4 items', () => {
    expect(worktreeTools).toHaveLength(4)
  })
})
