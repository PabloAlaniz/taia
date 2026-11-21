import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeChanges,
  logTaskUpdated,
  logTaskMoved,
  logProjectUpdated,
} from '@taia/core/services/activity.service'

const mockLogActivity = vi.fn()

vi.mock('@taia/core/db/repositories/activity.repository', () => ({
  logActivity: (...args: any[]) => mockLogActivity(...args),
}))

describe('activity.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeChanges', () => {
    it('detects changes only for tracked fields present in after', () => {
      const before = { a: 1, b: 2, c: 3 }
      const after = { a: 1, b: 5 }

      const changes = computeChanges(before, after, ['a', 'b', 'c'])
      expect(changes).toEqual({ b: { from: 2, to: 5 } })
    })

    it('does not include fields not present in after', () => {
      const before = { title: 'T', description: 'D' }
      const changes = computeChanges(before, { title: 'T2' }, ['title', 'description'])
      expect(changes).toEqual({ title: { from: 'T', to: 'T2' } })
    })
  })

  describe('logTaskUpdated', () => {
    it('skips logging when no changes', async () => {
      await logTaskUpdated({ id: 't1', title: 'Hello' } as any, {}, 'agent-1')
      expect(mockLogActivity).not.toHaveBeenCalled()
    })

    it('logs changes with a readable message and metadata', async () => {
      await logTaskUpdated(
        { id: 't1', title: 'Hello' } as any,
        { priority: { from: 'LOW', to: 'HIGH' } },
        'agent-1',
      )

      expect(mockLogActivity).toHaveBeenCalledTimes(1)
      const call = mockLogActivity.mock.calls[0][0]
      expect(call.type).toBe('task_updated')
      expect(call.task_id).toBe('t1')
      expect(call.agent_id).toBe('agent-1')
      expect(call.message).toContain('priority: LOW → HIGH')
      expect(call.metadata).toEqual({
        changes: { priority: { from: 'LOW', to: 'HIGH' } },
      })
    })
  })

  describe('logTaskMoved', () => {
    it('uses task_completed when isDoneState is true', async () => {
      await logTaskMoved(
        { id: 't1', title: 'Hello' } as any,
        'IN_PROGRESS' as any,
        'DONE' as any,
        'agent-1',
        true,
      )
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_completed',
          task_id: 't1',
          agent_id: 'agent-1',
          metadata: { from: 'IN_PROGRESS', to: 'DONE' },
        }),
      )
    })

    it('uses task_moved when moved to non-completed status', async () => {
      await logTaskMoved(
        { id: 't1', title: 'Hello' } as any,
        'INBOX' as any,
        'IN_PROGRESS' as any,
        'agent-1',
      )
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_moved',
          metadata: { from: 'INBOX', to: 'IN_PROGRESS' },
        }),
      )
    })
  })

  describe('logProjectUpdated', () => {
    it('skips logging when no changes', async () => {
      await logProjectUpdated({ id: 'p1', name: 'Proj' } as any, {})
      expect(mockLogActivity).not.toHaveBeenCalled()
    })

    it('logs changes with project_id in metadata', async () => {
      await logProjectUpdated({ id: 'p1', name: 'Proj' } as any, {
        name: { from: 'Proj', to: 'Proj2' },
      })

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'project_updated',
          metadata: {
            project_id: 'p1',
            changes: { name: { from: 'Proj', to: 'Proj2' } },
          },
        }),
      )
    })
  })
})
