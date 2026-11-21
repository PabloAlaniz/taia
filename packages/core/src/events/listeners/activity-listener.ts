/**
 * Activity Listener — logs domain events to the activity feed
 */

import { eventBus } from '../event-bus'
import type { Task, TaskStatus } from '@taia/types'

export function registerActivityListeners(): void {
  eventBus.on(
    'task:created',
    async (e) => {
      const { logTaskCreated } = await import('../../services/activity.service')
      await logTaskCreated(e.payload.task as Task, e.actor)
    },
    { id: 'activity:task-created' },
  )

  eventBus.on(
    'task:updated',
    async (e) => {
      const { logTaskUpdated, logTaskMoved, logTaskAssigned } = await import(
        '../../services/activity.service'
      )
      const { task, changes, oldStatus, newStatus, newAssignee } = e.payload

      if (newStatus && newStatus !== oldStatus) {
        await logTaskMoved(task as Task, oldStatus as TaskStatus, newStatus as TaskStatus, e.actor)
      }
      if (newAssignee) {
        await logTaskAssigned(task as Task, newAssignee as string, e.actor)
      }
      if (changes && Object.keys(changes as object).length > 0) {
        await logTaskUpdated(
          task as Task,
          changes as Record<string, { from: unknown; to: unknown }>,
          e.actor,
        )
      }
    },
    { id: 'activity:task-updated' },
  )

  eventBus.on(
    'task:moved',
    async (e) => {
      const { logTaskMoved } = await import('../../services/activity.service')
      await logTaskMoved(
        e.payload.task as Task,
        e.payload.oldStatus as TaskStatus,
        e.payload.newStatus as TaskStatus,
        e.actor,
      )
    },
    { id: 'activity:task-moved' },
  )

  eventBus.on(
    'task:deleted',
    async (e) => {
      const { logTaskDeleted } = await import('../../services/activity.service')
      await logTaskDeleted(e.payload.taskId as string, e.payload.taskTitle as string, e.actor)
    },
    { id: 'activity:task-deleted' },
  )

  eventBus.on(
    'task:assigned',
    async (e) => {
      const { logTaskAssigned } = await import('../../services/activity.service')
      await logTaskAssigned(e.payload.task as Task, e.payload.agentId as string, e.actor)
    },
    { id: 'activity:task-assigned' },
  )

  eventBus.on(
    'dependency:added',
    async (e) => {
      const { logDependencyAdded } = await import('../../services/activity.service')
      await logDependencyAdded(
        e.payload.taskId as string,
        e.payload.taskTitle as string,
        e.payload.dependsOnTaskId as string,
        e.payload.dependsOnTitle as string,
        e.actor,
      )
    },
    { id: 'activity:dependency-added' },
  )

  eventBus.on(
    'dependency:removed',
    async (e) => {
      const { logDependencyRemoved } = await import('../../services/activity.service')
      await logDependencyRemoved(
        e.payload.taskId as string,
        e.payload.taskTitle as string,
        e.payload.dependsOnTaskId as string,
        e.payload.dependsOnTitle as string,
        e.actor,
      )
    },
    { id: 'activity:dependency-removed' },
  )
}
