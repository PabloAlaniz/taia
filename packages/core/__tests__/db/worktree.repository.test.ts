import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getWorktreeById,
  getWorktreesForTask,
  getActiveWorktreeForTask,
  getWorktreesByStatus,
  getAllActiveWorktrees,
  createWorktreeRecord,
  updateWorktreeStatus,
  deleteWorktreeRecord,
} from '@taia/core/db/repositories/worktree.repository'

const mockQuery = vi.fn()
vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  generateId: () => 'test-id-123',
}))

const SAMPLE_WORKTREE = {
  id: 'wt-1',
  task_id: 'task-1',
  repository_id: 'repo-1',
  branch_name: 'agent/agent-1/task-12345678',
  base_branch: 'main',
  worktree_path: '/tmp/taia-worktrees/wt-1',
  status: 'active',
  created_by: 'agent-1',
  merge_strategy: 'squash',
  diff_stats: null,
  error_message: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWorktreeById', () => {
  it('returns worktree when found', async () => {
    mockQuery.mockResolvedValue({ rows: [SAMPLE_WORKTREE] })
    const result = await getWorktreeById('wt-1')
    expect(result).toBeDefined()
    expect(result?.id).toBe('wt-1')
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM worktrees WHERE id = $1', ['wt-1'])
  })

  it('returns undefined when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const result = await getWorktreeById('nonexistent')
    expect(result).toBeUndefined()
  })
})

describe('getWorktreesForTask', () => {
  it('returns all worktrees for task ordered by created_at DESC', async () => {
    mockQuery.mockResolvedValue({ rows: [SAMPLE_WORKTREE] })
    const result = await getWorktreesForTask('task-1')
    expect(result).toHaveLength(1)
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE task_id = $1'), [
      'task-1',
    ])
  })
})

describe('getActiveWorktreeForTask', () => {
  it('returns active worktree excluding terminal states', async () => {
    mockQuery.mockResolvedValue({ rows: [SAMPLE_WORKTREE] })
    const result = await getActiveWorktreeForTask('task-1')
    expect(result).toBeDefined()
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN ('merged', 'failed', 'cleanup')"),
      ['task-1'],
    )
  })

  it('returns undefined when no active worktree', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const result = await getActiveWorktreeForTask('task-1')
    expect(result).toBeUndefined()
  })
})

describe('getWorktreesByStatus', () => {
  it('filters by status', async () => {
    mockQuery.mockResolvedValue({ rows: [SAMPLE_WORKTREE] })
    await getWorktreesByStatus('active')
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE status = $1'), ['active'])
  })
})

describe('getAllActiveWorktrees', () => {
  it('returns non-terminal worktrees', async () => {
    mockQuery.mockResolvedValue({ rows: [SAMPLE_WORKTREE] })
    const result = await getAllActiveWorktrees()
    expect(result).toHaveLength(1)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN ('merged', 'failed', 'cleanup')"),
    )
  })
})

describe('createWorktreeRecord', () => {
  it('creates with generated ID and defaults', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_WORKTREE, id: 'test-id-123' }] }) // SELECT

    const result = await createWorktreeRecord({
      task_id: 'task-1',
      repository_id: 'repo-1',
      branch_name: 'agent/agent-1/task-12345678',
    })

    expect(result).toBeDefined()
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO worktrees'),
      expect.arrayContaining(['test-id-123', 'task-1', 'repo-1']),
    )
  })

  it('uses provided base_branch and merge_strategy', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [SAMPLE_WORKTREE] })

    await createWorktreeRecord({
      task_id: 'task-1',
      repository_id: 'repo-1',
      branch_name: 'agent/agent-1/task-12345678',
      base_branch: 'develop',
      merge_strategy: 'rebase',
    })

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO worktrees'),
      expect.arrayContaining(['develop', 'rebase']),
    )
  })
})

describe('updateWorktreeStatus', () => {
  it('updates status and timestamp', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_WORKTREE, status: 'reviewing' }] })

    const result = await updateWorktreeStatus('wt-1', 'reviewing')
    expect(result?.status).toBe('reviewing')
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $2'),
      expect.arrayContaining(['wt-1', 'reviewing']),
    )
  })

  it('includes extra fields when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [SAMPLE_WORKTREE] })

    await updateWorktreeStatus('wt-1', 'active', {
      worktree_path: '/tmp/path',
      error_message: 'test error',
    })

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('worktree_path'),
      expect.arrayContaining(['/tmp/path']),
    )
  })
})

describe('deleteWorktreeRecord', () => {
  it('returns true when deleted', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 })
    const result = await deleteWorktreeRecord('wt-1')
    expect(result).toBe(true)
  })

  it('returns false when not found', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 })
    const result = await deleteWorktreeRecord('nonexistent')
    expect(result).toBe(false)
  })
})
