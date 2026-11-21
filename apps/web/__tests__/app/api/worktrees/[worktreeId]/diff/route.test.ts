import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/worktrees/[worktreeId]/diff/route'

const mockGetWorktreeDiff = vi.fn()

vi.mock('@taia/core/services/worktree.service', () => ({
  getWorktreeDiff: (...args: any[]) => mockGetWorktreeDiff(...args),
}))

const SAMPLE_DIFF = {
  stats: {
    files_changed: 3,
    insertions: 42,
    deletions: 10,
    files: [
      { path: 'src/index.ts', insertions: 30, deletions: 5, status: 'modified' },
      { path: 'src/new.ts', insertions: 12, deletions: 0, status: 'added' },
      { path: 'src/old.ts', insertions: 0, deletions: 5, status: 'deleted' },
    ],
  },
  unified_diff: 'diff --git a/src/index.ts...',
  commits: [
    {
      hash: 'abc1234567890',
      short_hash: 'abc1234',
      message: 'Add feature',
      author: 'Agent 1',
      date: '2024-01-15T10:00:00Z',
    },
  ],
}

const makeContext = (worktreeId: string) => ({
  params: Promise.resolve({ worktreeId }),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/worktrees/[worktreeId]/diff', () => {
  it('returns diff result', async () => {
    mockGetWorktreeDiff.mockResolvedValue(SAMPLE_DIFF)
    const req = new NextRequest('http://localhost/api/worktrees/wt-1/diff')
    const res = await GET(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.diff.stats.files_changed).toBe(3)
    expect(data.diff.stats.insertions).toBe(42)
    expect(data.diff.commits).toHaveLength(1)
  })

  it('returns error when worktree not found', async () => {
    mockGetWorktreeDiff.mockRejectedValue(new Error("Worktree 'nonexistent' not found"))
    const req = new NextRequest('http://localhost/api/worktrees/nonexistent/diff')
    const res = await GET(req, makeContext('nonexistent'))
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.ok).toBe(false)
  })

  it('passes worktreeId to service', async () => {
    mockGetWorktreeDiff.mockResolvedValue(SAMPLE_DIFF)
    const req = new NextRequest('http://localhost/api/worktrees/wt-42/diff')
    await GET(req, makeContext('wt-42'))

    expect(mockGetWorktreeDiff).toHaveBeenCalledWith('wt-42')
  })
})
