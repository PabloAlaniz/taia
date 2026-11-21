import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockLogActivity = vi.fn()

vi.mock('@taia/core/db/pool', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}))

vi.mock('@taia/core/db/repositories/activity.repository', () => ({
  logActivity: (...args: any[]) => mockLogActivity(...args),
}))

import {
  listTaskTrajectories,
  recordTaskTrajectory,
  sanitizeTrajectoryMetadata,
} from '@taia/core/services/task-trajectory.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('task-trajectory.service', () => {
  function mockEnsureQueries() {
    for (let index = 0; index < 9; index += 1) {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    }
  }

  it('redacts secret-like metadata keys recursively', () => {
    expect(
      sanitizeTrajectoryMetadata({
        ok: true,
        api_key: 'secret',
        nested: { token: 'hidden', label: 'safe' },
      }),
    ).toEqual({ ok: true, api_key: '[redacted]', nested: { token: '[redacted]', label: 'safe' } })
  })

  it('records a trajectory only when the task belongs to the workspace', async () => {
    mockEnsureQueries()
    mockQuery.mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-a' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'trajectory-1',
          workspace_id: 'ws-a',
          task_id: 'task-1',
          actor: 'agent-a',
          decision: 'Ship change',
          reasoning: 'Tests pass',
          outcome: 'done',
          metadata: { token: '[redacted]' },
        },
      ],
    })

    const event = await recordTaskTrajectory({
      workspaceId: 'ws-a',
      taskId: 'task-1',
      actor: 'agent-a',
      decision: 'Ship change',
      reasoning: 'Tests pass',
      outcome: 'done',
      metadata: { token: 'secret' },
    })

    expect(event.id).toBe('trajectory-1')
    expect(mockQuery.mock.calls[10][1]).toEqual([
      expect.stringMatching(/^trajectory-/),
      'ws-a',
      'task-1',
      'agent-a',
      'Ship change',
      'Tests pass',
      'done',
      JSON.stringify({ token: '[redacted]' }),
    ])
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_triggered',
        workspace_id: 'ws-a',
        task_id: 'task-1',
      }),
    )
  })

  it('rejects cross-workspace writes', async () => {
    mockEnsureQueries()
    mockQuery.mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-b' }] })

    await expect(
      recordTaskTrajectory({ workspaceId: 'ws-a', taskId: 'task-1', decision: 'Nope' }),
    ).rejects.toThrow('Task does not belong to requested workspace')
  })

  it('lists trajectories ordered by chain order with workspace isolation and capped pagination', async () => {
    mockEnsureQueries()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }, { id: 't2' }] })

    const result = await listTaskTrajectories({
      workspaceId: 'ws-a',
      taskId: 'task-1',
      limit: 500,
      offset: 1,
    })

    expect(result.total).toBe(2)
    expect(result.limit).toBe(200)
    expect(result.offset).toBe(1)
    expect(mockQuery.mock.calls[10][0]).toContain('WHERE workspace_id = $1 AND task_id = $2')
    expect(mockQuery.mock.calls[10][0]).toContain('ORDER BY created_at ASC, id ASC')
    expect(mockQuery.mock.calls[10][1]).toEqual(['ws-a', 'task-1', 200, 1])
  })
})
