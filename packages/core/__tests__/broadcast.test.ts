import { describe, it, expect, vi, beforeEach } from 'vitest'
import { broadcastTaskUpdate, broadcastAgentStatus, broadcastActivity } from '@taia/core/broadcast'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true })
})

describe('broadcastTaskUpdate', () => {
  it('sends task:created event', async () => {
    await broadcastTaskUpdate('task-123', 'created', { id: 'task-123', title: 'Test' })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:13335/broadcast',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.type).toBe('task:created')
    expect(body.payload.taskId).toBe('task-123')
  })

  it('sends task:moved event', async () => {
    await broadcastTaskUpdate('task-456', 'moved', { id: 'task-456', status: 'DONE' })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.type).toBe('task:moved')
  })

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    // Should not throw
    await expect(broadcastTaskUpdate('task-123', 'created')).resolves.not.toThrow()
  })
})

describe('broadcastAgentStatus', () => {
  it('sends agent:status event', async () => {
    await broadcastAgentStatus('agent-1', 'WORKING', 'task-789')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.type).toBe('agent:status')
    expect(body.payload.agentId).toBe('agent-1')
    expect(body.payload.status).toBe('WORKING')
    expect(body.payload.taskId).toBe('task-789')
  })
})

describe('broadcastActivity', () => {
  it('sends activity:new event', async () => {
    const activity = { id: 'act-1', type: 'task_completed', message: 'Done!' }
    await broadcastActivity(activity)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.type).toBe('activity:new')
    expect(body.payload).toEqual(activity)
  })
})
