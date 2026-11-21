import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from '@/app/api/worktrees/[worktreeId]/route'

const mockGetWorktreeById = vi.fn()
const mockStartReview = vi.fn()
const mockMergeWorktree = vi.fn()
const mockAbortWorktree = vi.fn()
const mockCleanupWorktree = vi.fn()
const mockDeleteWorktreeRecord = vi.fn()

vi.mock('@taia/core/services/worktree.service', () => ({
  getWorktreeById: (...args: any[]) => mockGetWorktreeById(...args),
  startReview: (...args: any[]) => mockStartReview(...args),
  mergeWorktree: (...args: any[]) => mockMergeWorktree(...args),
  abortWorktree: (...args: any[]) => mockAbortWorktree(...args),
  cleanupWorktree: (...args: any[]) => mockCleanupWorktree(...args),
}))

vi.mock('@taia/core/db', () => ({
  deleteWorktreeRecord: (...args: any[]) => mockDeleteWorktreeRecord(...args),
}))

const SAMPLE_WORKTREE = {
  id: 'wt-1',
  task_id: 'task-1',
  repository_id: 'repo-1',
  branch_name: 'agent/agent-1/task-12345678',
  base_branch: 'main',
  status: 'active',
  merge_strategy: 'squash',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const makeContext = (worktreeId: string) => ({
  params: Promise.resolve({ worktreeId }),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/worktrees/[worktreeId]', () => {
  it('returns worktree by ID', async () => {
    mockGetWorktreeById.mockResolvedValue(SAMPLE_WORKTREE)
    const req = new NextRequest('http://localhost/api/worktrees/wt-1')
    const res = await GET(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.worktree.id).toBe('wt-1')
  })

  it('returns 404 when not found', async () => {
    mockGetWorktreeById.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost/api/worktrees/nonexistent')
    const res = await GET(req, makeContext('nonexistent'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
  })
})

describe('POST /api/worktrees/[worktreeId] — actions', () => {
  it('handles review action', async () => {
    mockStartReview.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'reviewing' })
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'review' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.worktree.status).toBe('reviewing')
  })

  it('handles merge action', async () => {
    mockMergeWorktree.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'merged' })
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'merge' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.worktree.status).toBe('merged')
  })

  it('handles merge with custom strategy', async () => {
    mockMergeWorktree.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'merged' })
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'merge', strategy: 'rebase' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req, makeContext('wt-1'))

    expect(mockMergeWorktree).toHaveBeenCalledWith('wt-1', { strategy: 'rebase' })
  })

  it('handles abort action', async () => {
    mockAbortWorktree.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'failed' })
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'abort' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.worktree.status).toBe('failed')
  })

  it('handles cleanup action', async () => {
    mockCleanupWorktree.mockResolvedValue(undefined)
    mockGetWorktreeById.mockResolvedValue({ ...SAMPLE_WORKTREE, status: 'cleanup' })
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'cleanup' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.worktree.status).toBe('cleanup')
  })

  it('returns 400 for invalid action', async () => {
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
  })
})

describe('DELETE /api/worktrees/[worktreeId]', () => {
  it('deletes worktree record', async () => {
    mockDeleteWorktreeRecord.mockResolvedValue(true)
    const req = new NextRequest('http://localhost/api/worktrees/wt-1', { method: 'DELETE' })
    const res = await DELETE(req, makeContext('wt-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.deleted).toBe(true)
  })

  it('returns 404 when not found', async () => {
    mockDeleteWorktreeRecord.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/worktrees/nonexistent', { method: 'DELETE' })
    const res = await DELETE(req, makeContext('nonexistent'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
  })
})
