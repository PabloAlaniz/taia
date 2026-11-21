import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB functions
const mockGetTaskById = vi.fn()
const mockGetRepositoryById = vi.fn()
const mockGetPrimaryRepository = vi.fn()
const mockGetWorktreeById = vi.fn()
const mockGetActiveWorktreeForTask = vi.fn()
const mockGetAllActiveWorktrees = vi.fn()
const mockCreateWorktreeRecord = vi.fn()
const mockUpdateWorktreeStatus = vi.fn()
const mockDeleteWorktreeRecord = vi.fn()

vi.mock('@taia/core/db', () => ({
  getWorktreeById: (...args: any[]) => mockGetWorktreeById(...args),
  getWorktreesForTask: vi.fn().mockResolvedValue([]),
  getActiveWorktreeForTask: (...args: any[]) => mockGetActiveWorktreeForTask(...args),
  getAllActiveWorktrees: (...args: any[]) => mockGetAllActiveWorktrees(...args),
  createWorktreeRecord: (...args: any[]) => mockCreateWorktreeRecord(...args),
  updateWorktreeStatus: (...args: any[]) => mockUpdateWorktreeStatus(...args),
  deleteWorktreeRecord: (...args: any[]) => mockDeleteWorktreeRecord(...args),
  getSetting: vi.fn().mockResolvedValue(null),
}))

vi.mock('@taia/core/db/repositories/task.repository', () => ({
  getTaskById: (...args: any[]) => mockGetTaskById(...args),
}))

vi.mock('@taia/core/db/repositories/repository.repository', () => ({
  getRepositoryById: (...args: any[]) => mockGetRepositoryById(...args),
  getPrimaryRepository: (...args: any[]) => mockGetPrimaryRepository(...args),
}))

vi.mock('@taia/core/broadcast', () => ({
  broadcastWorktreeUpdate: vi.fn(),
}))

vi.mock('@taia/core/services/activity.service', () => ({
  logWorktreeCreated: vi.fn(),
  logWorktreeMerged: vi.fn(),
  logWorktreeFailed: vi.fn(),
}))

// Mock infrastructure — lazy import path used by service
const mockCloneIfNeeded = vi.fn()
const mockCreateWorktreeGit = vi.fn()
const mockMergeWorktreeGit = vi.fn()
const mockRemoveWorktree = vi.fn()
const mockRunSetupCommand = vi.fn()
const mockGetWorktreeDiffGit = vi.fn()

// The service does lazy `import('@taia/domain/infrastructure/git-worktree')`
vi.mock('@taia/domain/infrastructure/git-worktree', () => ({
  validateBranchName: () => true,
  generateBranchName: (agentId: string, taskId: string) =>
    `agent/${agentId}/task-${taskId.slice(-8)}`,
  getRepoClonePath: (_base: string, url: string) => `/tmp/repos/${url.replace(/[^a-z]/g, '_')}`,
  cloneIfNeeded: (...args: any[]) => mockCloneIfNeeded(...args),
  createWorktree: (...args: any[]) => mockCreateWorktreeGit(...args),
  mergeWorktree: (...args: any[]) => mockMergeWorktreeGit(...args),
  removeWorktree: (...args: any[]) => mockRemoveWorktree(...args),
  runSetupCommand: (...args: any[]) => mockRunSetupCommand(...args),
  getWorktreeDiff: (...args: any[]) => mockGetWorktreeDiffGit(...args),
}))

vi.mock('@taia/core/config', () => ({
  config: {
    worktree: {
      basePath: '/tmp/taia-worktrees',
      repoClonePath: '/tmp/taia-repos',
      cleanupAfterHours: 72,
      setupCommand: '',
      autoCleanup: true,
      autoCreateOnAssign: false,
    },
  },
}))

import {
  createWorktree,
  getWorktreeDiff,
  startReview,
  mergeWorktree,
  abortWorktree,
  cleanupStaleWorktrees,
} from '@taia/core/services/worktree.service'

const SAMPLE_TASK = {
  id: 'task-12345678',
  title: 'Test task',
  status: 'IN_PROGRESS',
  project_id: 'proj-1',
  repo_url: 'https://github.com/org/repo',
  assigned_to: 'agent-1',
}

const SAMPLE_REPO = {
  id: 'repo-1',
  project_id: 'proj-1',
  name: 'main-repo',
  url: 'https://github.com/org/repo',
  is_primary: true,
}

const SAMPLE_WORKTREE = {
  id: 'wt-1',
  task_id: 'task-12345678',
  repository_id: 'repo-1',
  branch_name: 'agent/agent-1/task-12345678',
  base_branch: 'main',
  worktree_path: '/tmp/taia-worktrees/wt-1',
  status: 'active' as const,
  created_by: 'agent-1',
  merge_strategy: 'squash' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCloneIfNeeded.mockResolvedValue(undefined)
  mockCreateWorktreeGit.mockResolvedValue(undefined)
  mockRunSetupCommand.mockResolvedValue(undefined)
  mockMergeWorktreeGit.mockResolvedValue(undefined)
  mockRemoveWorktree.mockResolvedValue(undefined)
})

describe('createWorktree', () => {
  it('creates worktree successfully with project primary repo', async () => {
    mockGetTaskById.mockResolvedValue(SAMPLE_TASK)
    mockGetActiveWorktreeForTask.mockResolvedValue(undefined)
    mockGetPrimaryRepository.mockResolvedValue(SAMPLE_REPO)
    mockCreateWorktreeRecord.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'creating' })
    mockUpdateWorktreeStatus.mockResolvedValue(SAMPLE_WORKTREE)

    const result = await createWorktree({ task_id: 'task-12345678', created_by: 'agent-1' })

    expect(result).toBeDefined()
    expect(result.status).toBe('active')
    expect(mockCloneIfNeeded).toHaveBeenCalled()
    expect(mockCreateWorktreeGit).toHaveBeenCalled()
  })

  it('throws when task not found', async () => {
    mockGetTaskById.mockResolvedValue(undefined)
    await expect(createWorktree({ task_id: 'nonexistent' })).rejects.toThrow(/not found/)
  })

  it('throws when active worktree exists', async () => {
    mockGetTaskById.mockResolvedValue(SAMPLE_TASK)
    mockGetActiveWorktreeForTask.mockResolvedValue(SAMPLE_WORKTREE)
    await expect(createWorktree({ task_id: 'task-12345678' })).rejects.toThrow(
      /already has an active worktree/,
    )
  })

  it('throws when no repository found', async () => {
    mockGetTaskById.mockResolvedValue({
      ...SAMPLE_TASK,
      repo_url: undefined,
      primary_repo_url: undefined,
      project_id: undefined,
    })
    mockGetActiveWorktreeForTask.mockResolvedValue(undefined)
    await expect(createWorktree({ task_id: 'task-12345678' })).rejects.toThrow(
      /no associated repository/i,
    )
  })

  it('marks as failed when git operation fails', async () => {
    mockGetTaskById.mockResolvedValue(SAMPLE_TASK)
    mockGetActiveWorktreeForTask.mockResolvedValue(undefined)
    mockGetPrimaryRepository.mockResolvedValue(SAMPLE_REPO)
    mockCreateWorktreeRecord.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'creating' })
    mockCloneIfNeeded.mockRejectedValue(new Error('Clone failed'))
    mockUpdateWorktreeStatus.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'failed' })

    await expect(createWorktree({ task_id: 'task-12345678' })).rejects.toThrow(
      /Failed to create worktree/,
    )

    expect(mockUpdateWorktreeStatus).toHaveBeenCalledWith(
      SAMPLE_WORKTREE.id,
      'failed',
      expect.objectContaining({ error_message: 'Clone failed' }),
    )
  })

  it('uses explicit repository_id when provided', async () => {
    mockGetTaskById.mockResolvedValue(SAMPLE_TASK)
    mockGetActiveWorktreeForTask.mockResolvedValue(undefined)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockCreateWorktreeRecord.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'creating' })
    mockUpdateWorktreeStatus.mockResolvedValue(SAMPLE_WORKTREE)

    await createWorktree({ task_id: 'task-12345678', repository_id: 'repo-1' })

    expect(mockGetRepositoryById).toHaveBeenCalledWith('repo-1')
  })
})

describe('getWorktreeDiff', () => {
  it('fetches and caches diff', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockGetWorktreeDiffGit.mockResolvedValue({
      stats: { files_changed: 2, insertions: 10, deletions: 5, files: [] },
      unified_diff: 'diff...',
      commits: [],
    })
    mockUpdateWorktreeStatus.mockResolvedValue(SAMPLE_WORKTREE)

    const result = await getWorktreeDiff('wt-1')

    expect(result.stats.files_changed).toBe(2)
    expect(mockUpdateWorktreeStatus).toHaveBeenCalledWith(
      'wt-1',
      'active',
      expect.objectContaining({ diff_stats: expect.any(Object) }),
    )
  })

  it('throws when worktree not found', async () => {
    mockGetWorktreeById.mockResolvedValue(undefined)
    await expect(getWorktreeDiff('nonexistent')).rejects.toThrow(/not found/)
  })
})

describe('startReview', () => {
  it('transitions active → reviewing', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    mockUpdateWorktreeStatus.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'reviewing' })

    const result = await startReview('wt-1')
    expect(result.status).toBe('reviewing')
  })

  it('rejects non-active worktrees', async () => {
    mockGetWorktreeById.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'merged' })
    await expect(startReview('wt-1')).rejects.toThrow(/Cannot review/)
  })
})

describe('mergeWorktree', () => {
  it('merges successfully with squash strategy', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockUpdateWorktreeStatus
      .mockResolvedValueOnce({ ...SAMPLE_WORKTREE, status: 'merging' })
      .mockResolvedValueOnce({ ...SAMPLE_WORKTREE, status: 'merged' })

    const result = await mergeWorktree('wt-1')
    expect(result.status).toBe('merged')
    expect(mockMergeWorktreeGit).toHaveBeenCalledWith(
      expect.any(String),
      SAMPLE_WORKTREE.branch_name,
      'main',
      'squash',
    )
  })

  it('allows override strategy', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockUpdateWorktreeStatus.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'merged' })

    await mergeWorktree('wt-1', { strategy: 'rebase' })
    expect(mockMergeWorktreeGit).toHaveBeenCalledWith(
      expect.any(String),
      SAMPLE_WORKTREE.branch_name,
      'main',
      'rebase',
    )
  })

  it('marks as failed when merge fails', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockUpdateWorktreeStatus.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'failed' })
    mockMergeWorktreeGit.mockRejectedValue(new Error('Merge conflict'))

    await expect(mergeWorktree('wt-1')).rejects.toThrow(/Merge failed/)
  })

  it('rejects invalid status transitions', async () => {
    mockGetWorktreeById.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'merged' })
    await expect(mergeWorktree('wt-1')).rejects.toThrow(/Cannot merge/)
  })
})

describe('abortWorktree', () => {
  it('marks as failed with abort message', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockUpdateWorktreeStatus.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'failed' })

    const result = await abortWorktree('wt-1')
    expect(result.status).toBe('failed')
    expect(mockUpdateWorktreeStatus).toHaveBeenCalledWith(
      'wt-1',
      'failed',
      expect.objectContaining({ error_message: 'Aborted by user' }),
    )
  })
})

describe('cleanupStaleWorktrees', () => {
  it('cleans up worktrees older than threshold', async () => {
    const oldWorktree = {
      ...SAMPLE_WORKTREE,
      created_at: new Date(Date.now() - 100 * 3600_000).toISOString(),
    }
    mockGetAllActiveWorktrees.mockResolvedValue([oldWorktree])
    mockGetWorktreeById.mockResolvedValue(oldWorktree)
    mockGetRepositoryById.mockResolvedValue(SAMPLE_REPO)
    mockUpdateWorktreeStatus.mockResolvedValue({ ...oldWorktree, status: 'cleanup' })

    const cleaned = await cleanupStaleWorktrees()
    expect(cleaned).toBe(1)
  })

  it('skips recent worktrees', async () => {
    const recentWorktree = {
      ...SAMPLE_WORKTREE,
      created_at: new Date().toISOString(),
    }
    mockGetAllActiveWorktrees.mockResolvedValue([recentWorktree])

    const cleaned = await cleanupStaleWorktrees()
    expect(cleaned).toBe(0)
  })
})
