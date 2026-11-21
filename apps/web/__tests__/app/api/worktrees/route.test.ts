import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/worktrees/route'

const mockCreateWorktree = vi.fn()
const mockGetWorktreesForTask = vi.fn()
const mockGetAllActiveWorktrees = vi.fn()

vi.mock('@taia/core/services/worktree.service', () => ({
  createWorktree: (...args: any[]) => mockCreateWorktree(...args),
  getWorktreesForTask: (...args: any[]) => mockGetWorktreesForTask(...args),
}))

vi.mock('@taia/core/db', () => ({
  getAllActiveWorktrees: (...args: any[]) => mockGetAllActiveWorktrees(...args),
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/worktrees', () => {
  it('returns worktrees filtered by task_id', async () => {
    mockGetWorktreesForTask.mockResolvedValue([SAMPLE_WORKTREE])
    const req = new NextRequest('http://localhost/api/worktrees?task_id=task-1')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.worktrees).toHaveLength(1)
    expect(mockGetWorktreesForTask).toHaveBeenCalledWith('task-1')
  })

  it('returns all active worktrees when no filter', async () => {
    mockGetAllActiveWorktrees.mockResolvedValue([SAMPLE_WORKTREE])
    const req = new NextRequest('http://localhost/api/worktrees')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.worktrees).toHaveLength(1)
    expect(mockGetAllActiveWorktrees).toHaveBeenCalled()
  })
})

describe('POST /api/worktrees', () => {
  it('creates a worktree successfully', async () => {
    mockCreateWorktree.mockResolvedValue(SAMPLE_WORKTREE)
    const req = new NextRequest('http://localhost/api/worktrees', {
      method: 'POST',
      body: JSON.stringify({ task_id: 'task-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.worktree.id).toBe('wt-1')
  })

  it('returns 400 for missing task_id', async () => {
    const req = new NextRequest('http://localhost/api/worktrees', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
  })

  it('passes base_branch and merge_strategy', async () => {
    mockCreateWorktree.mockResolvedValue(SAMPLE_WORKTREE)
    const req = new NextRequest('http://localhost/api/worktrees', {
      method: 'POST',
      body: JSON.stringify({ task_id: 'task-1', base_branch: 'develop', merge_strategy: 'rebase' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)

    expect(mockCreateWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ base_branch: 'develop', merge_strategy: 'rebase' }),
    )
  })
})
