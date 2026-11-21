import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@taia/core/events/event-bus'

const mockBroadcastTaskUpdate = vi.fn()
const mockBroadcastDependencyUpdate = vi.fn()

vi.mock('@taia/core/broadcast', () => ({
  broadcastTaskUpdate: (...args: any[]) => mockBroadcastTaskUpdate(...args),
  broadcastDependencyUpdate: (...args: any[]) => mockBroadcastDependencyUpdate(...args),
}))

import { registerBroadcastListeners } from '@taia/core/events/listeners/broadcast-listener'

const SAMPLE_TASK = { id: 'task-1', title: 'Test Task', status: 'IN_PROGRESS' }

beforeEach(() => {
  vi.clearAllMocks()
  eventBus.clear()
  registerBroadcastListeners()
})

describe('broadcast-listener', () => {
  it('task:created broadcasts with created', async () => {
    await eventBus.emit({
      type: 'task:created',
      payload: { task: SAMPLE_TASK },
      timestamp: Date.now(),
    })

    expect(mockBroadcastTaskUpdate).toHaveBeenCalledWith('task-1', 'created', SAMPLE_TASK)
  })

  it('task:updated broadcasts with updated', async () => {
    await eventBus.emit({
      type: 'task:updated',
      payload: { task: SAMPLE_TASK },
      timestamp: Date.now(),
    })

    expect(mockBroadcastTaskUpdate).toHaveBeenCalledWith('task-1', 'updated', SAMPLE_TASK)
  })

  it('task:moved broadcasts with moved', async () => {
    await eventBus.emit({
      type: 'task:moved',
      payload: { task: SAMPLE_TASK },
      timestamp: Date.now(),
    })

    expect(mockBroadcastTaskUpdate).toHaveBeenCalledWith('task-1', 'moved', SAMPLE_TASK)
  })

  it('task:deleted broadcasts with deleted', async () => {
    await eventBus.emit({
      type: 'task:deleted',
      payload: { taskId: 'task-1', taskTitle: 'Test Task' },
      timestamp: Date.now(),
    })

    expect(mockBroadcastTaskUpdate).toHaveBeenCalledWith('task-1', 'deleted')
  })

  it('task:assigned broadcasts with updated', async () => {
    await eventBus.emit({
      type: 'task:assigned',
      payload: { task: SAMPLE_TASK, agentId: 'agent-1' },
      timestamp: Date.now(),
    })

    expect(mockBroadcastTaskUpdate).toHaveBeenCalledWith('task-1', 'updated', SAMPLE_TASK)
  })

  it('dependency:added broadcasts with added', async () => {
    const payload = {
      taskId: 'task-1',
      taskTitle: 'Task 1',
      dependsOnTaskId: 'task-2',
      dependsOnTitle: 'Task 2',
    }

    await eventBus.emit({
      type: 'dependency:added',
      payload,
      timestamp: Date.now(),
    })

    expect(mockBroadcastDependencyUpdate).toHaveBeenCalledWith('task-1', 'added', payload)
  })

  it('dependency:removed broadcasts with removed', async () => {
    const payload = {
      taskId: 'task-1',
      taskTitle: 'Task 1',
      dependsOnTaskId: 'task-2',
      dependsOnTitle: 'Task 2',
    }

    await eventBus.emit({
      type: 'dependency:removed',
      payload,
      timestamp: Date.now(),
    })

    expect(mockBroadcastDependencyUpdate).toHaveBeenCalledWith('task-1', 'removed', payload)
  })
})
