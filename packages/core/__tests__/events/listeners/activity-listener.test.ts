import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@taia/core/events/event-bus'

const mockLogTaskCreated = vi.fn()
const mockLogTaskUpdated = vi.fn()
const mockLogTaskMoved = vi.fn()
const mockLogTaskAssigned = vi.fn()
const mockLogTaskDeleted = vi.fn()
const mockLogDependencyAdded = vi.fn()
const mockLogDependencyRemoved = vi.fn()

vi.mock('@taia/core/services/activity.service', () => ({
  logTaskCreated: (...args: any[]) => mockLogTaskCreated(...args),
  logTaskUpdated: (...args: any[]) => mockLogTaskUpdated(...args),
  logTaskMoved: (...args: any[]) => mockLogTaskMoved(...args),
  logTaskAssigned: (...args: any[]) => mockLogTaskAssigned(...args),
  logTaskDeleted: (...args: any[]) => mockLogTaskDeleted(...args),
  logDependencyAdded: (...args: any[]) => mockLogDependencyAdded(...args),
  logDependencyRemoved: (...args: any[]) => mockLogDependencyRemoved(...args),
}))

import { registerActivityListeners } from '@taia/core/events/listeners/activity-listener'

const SAMPLE_TASK = { id: 'task-1', title: 'Test Task', status: 'IN_PROGRESS' }

beforeEach(() => {
  vi.clearAllMocks()
  eventBus.clear()
  registerActivityListeners()
})

describe('activity-listener', () => {
  it('task:created event calls logTaskCreated', async () => {
    await eventBus.emit({
      type: 'task:created',
      payload: { task: SAMPLE_TASK },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskCreated).toHaveBeenCalledWith(SAMPLE_TASK, 'agent-1')
  })

  it('task:updated with status change calls logTaskMoved', async () => {
    await eventBus.emit({
      type: 'task:updated',
      payload: {
        task: SAMPLE_TASK,
        changes: {},
        oldStatus: 'INBOX',
        newStatus: 'IN_PROGRESS',
      },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskMoved).toHaveBeenCalledWith(SAMPLE_TASK, 'INBOX', 'IN_PROGRESS', 'agent-1')
  })

  it('task:updated with newAssignee calls logTaskAssigned', async () => {
    await eventBus.emit({
      type: 'task:updated',
      payload: {
        task: SAMPLE_TASK,
        changes: {},
        newAssignee: 'agent-2',
      },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskAssigned).toHaveBeenCalledWith(SAMPLE_TASK, 'agent-2', 'agent-1')
  })

  it('task:updated with changes calls logTaskUpdated', async () => {
    const changes = { priority: { from: 'LOW', to: 'HIGH' } }
    await eventBus.emit({
      type: 'task:updated',
      payload: { task: SAMPLE_TASK, changes },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskUpdated).toHaveBeenCalledWith(SAMPLE_TASK, changes, 'agent-1')
  })

  it('task:moved event calls logTaskMoved', async () => {
    await eventBus.emit({
      type: 'task:moved',
      payload: {
        task: SAMPLE_TASK,
        oldStatus: 'IN_PROGRESS',
        newStatus: 'DONE',
      },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskMoved).toHaveBeenCalledWith(SAMPLE_TASK, 'IN_PROGRESS', 'DONE', 'agent-1')
  })

  it('task:deleted event calls logTaskDeleted', async () => {
    await eventBus.emit({
      type: 'task:deleted',
      payload: { taskId: 'task-1', taskTitle: 'Test Task' },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskDeleted).toHaveBeenCalledWith('task-1', 'Test Task', 'agent-1')
  })

  it('task:assigned event calls logTaskAssigned', async () => {
    await eventBus.emit({
      type: 'task:assigned',
      payload: { task: SAMPLE_TASK, agentId: 'agent-2' },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogTaskAssigned).toHaveBeenCalledWith(SAMPLE_TASK, 'agent-2', 'agent-1')
  })

  it('dependency:added calls logDependencyAdded', async () => {
    await eventBus.emit({
      type: 'dependency:added',
      payload: {
        taskId: 'task-1',
        taskTitle: 'Task 1',
        dependsOnTaskId: 'task-2',
        dependsOnTitle: 'Task 2',
      },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogDependencyAdded).toHaveBeenCalledWith(
      'task-1',
      'Task 1',
      'task-2',
      'Task 2',
      'agent-1',
    )
  })

  it('dependency:removed calls logDependencyRemoved', async () => {
    await eventBus.emit({
      type: 'dependency:removed',
      payload: {
        taskId: 'task-1',
        taskTitle: 'Task 1',
        dependsOnTaskId: 'task-2',
        dependsOnTitle: 'Task 2',
      },
      timestamp: Date.now(),
      actor: 'agent-1',
    })

    expect(mockLogDependencyRemoved).toHaveBeenCalledWith(
      'task-1',
      'Task 1',
      'task-2',
      'Task 2',
      'agent-1',
    )
  })
})
