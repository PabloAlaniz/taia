import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@taia/core/events/event-bus'

const mockCreateWorktree = vi.fn()
const mockGetWorktreeConfig = vi.fn()

vi.mock('@taia/core/services/worktree.service', () => ({
  createWorktree: (...args: any[]) => mockCreateWorktree(...args),
}))

vi.mock('@taia/core/services/worktree-config', () => ({
  getWorktreeConfig: (...args: any[]) => mockGetWorktreeConfig(...args),
}))

import { registerWorktreeListeners } from '@taia/core/events/listeners/worktree-listener'

beforeEach(() => {
  vi.clearAllMocks()
  eventBus.clear()
  mockGetWorktreeConfig.mockResolvedValue({
    autoCreateOnAssign: true,
    basePath: '/tmp/taia-worktrees',
    repoClonePath: '/tmp/taia-repos',
    cleanupAfterHours: 72,
    setupCommand: '',
    autoCleanup: true,
  })
  registerWorktreeListeners()
})

describe('worktree-listener', () => {
  it('creates worktree on task:assigned when autoCreate enabled and task has repo_url', async () => {
    const task = { id: 'task-1', title: 'Test', repo_url: 'https://github.com/org/repo' }
    mockCreateWorktree.mockResolvedValue({ id: 'wt-1', status: 'active' })

    await eventBus.emit({
      type: 'task:assigned',
      payload: { task, agentId: 'agent-1' },
      timestamp: Date.now(),
    })

    expect(mockCreateWorktree).toHaveBeenCalledWith({
      task_id: 'task-1',
      created_by: 'agent-1',
    })
  })

  it('skips when autoCreateOnAssign is false', async () => {
    mockGetWorktreeConfig.mockResolvedValue({ autoCreateOnAssign: false })
    const task = { id: 'task-1', title: 'Test', repo_url: 'https://github.com/org/repo' }

    await eventBus.emit({
      type: 'task:assigned',
      payload: { task, agentId: 'agent-1' },
      timestamp: Date.now(),
    })

    expect(mockCreateWorktree).not.toHaveBeenCalled()
  })

  it('skips when task has no repo_url or primary_repo_url', async () => {
    const task = { id: 'task-1', title: 'Test' }

    await eventBus.emit({
      type: 'task:assigned',
      payload: { task, agentId: 'agent-1' },
      timestamp: Date.now(),
    })

    expect(mockCreateWorktree).not.toHaveBeenCalled()
  })

  it('continues assignment even if createWorktree throws', async () => {
    const task = { id: 'task-1', title: 'Test', repo_url: 'https://github.com/org/repo' }
    mockCreateWorktree.mockRejectedValue(new Error('Git clone failed'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      eventBus.emit({
        type: 'task:assigned',
        payload: { task, agentId: 'agent-1' },
        timestamp: Date.now(),
      }),
    ).resolves.not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WorktreeAutoCreate] Failed for task task-1'),
    )

    warnSpy.mockRestore()
  })

  it('creates worktree when task has primary_repo_url instead of repo_url', async () => {
    const task = { id: 'task-2', title: 'Test', primary_repo_url: 'https://github.com/org/repo2' }
    mockCreateWorktree.mockResolvedValue({ id: 'wt-2', status: 'active' })

    await eventBus.emit({
      type: 'task:assigned',
      payload: { task, agentId: 'agent-1' },
      timestamp: Date.now(),
    })

    expect(mockCreateWorktree).toHaveBeenCalledWith({
      task_id: 'task-2',
      created_by: 'agent-1',
    })
  })
})
