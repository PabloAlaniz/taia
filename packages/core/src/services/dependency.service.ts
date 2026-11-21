// Dependency service — business logic for task blocks/blocked-by relationships
//
// Side effects (activity logging, broadcasting) handled by event bus listeners.

import {
  getTaskById,
  getBlockersForTask,
  getDependentsOfTask,
  addDependency as addDependencyRepo,
  removeDependencyById,
  removeDependency as removeDependencyRepo,
  wouldCreateCycle,
  areAllBlockersResolved,
  getUnresolvedBlockerCount,
} from '../db/index'
import { eventBus } from '../events/event-bus'
import { NotFoundError, AppError } from '../errors'
import type { TaskDependency, TaskDependencyDetail } from '@taia/types'

export async function getDependencies(taskId: string): Promise<{
  blockers: TaskDependencyDetail[]
  dependents: TaskDependencyDetail[]
}> {
  const task = await getTaskById(taskId)
  if (!task) throw new NotFoundError('Task', taskId)

  const [blockers, dependents] = await Promise.all([
    getBlockersForTask(taskId),
    getDependentsOfTask(taskId),
  ])

  return { blockers, dependents }
}

export async function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  addedBy: string,
): Promise<TaskDependency> {
  const [task, dependsOnTask] = await Promise.all([
    getTaskById(taskId),
    getTaskById(dependsOnTaskId),
  ])

  if (!task) throw new NotFoundError('Task', taskId)
  if (!dependsOnTask) throw new NotFoundError('Task', dependsOnTaskId)

  if (taskId === dependsOnTaskId) {
    throw new AppError('A task cannot depend on itself', 400, 'SELF_DEPENDENCY')
  }

  const cycleDetected = await wouldCreateCycle(taskId, dependsOnTaskId)
  if (cycleDetected) {
    throw new AppError(
      `Adding this dependency would create a cycle: "${dependsOnTask.title}" already depends (directly or transitively) on "${task.title}"`,
      400,
      'CYCLE_DETECTED',
    )
  }

  const dependency = await addDependencyRepo(taskId, dependsOnTaskId)

  await eventBus.emit({
    type: 'dependency:added',
    payload: {
      taskId,
      taskTitle: task.title,
      dependsOnTaskId,
      dependsOnTitle: dependsOnTask.title,
      dependency,
      task,
      dependsOnTask,
    },
    actor: addedBy,
    timestamp: Date.now(),
  })

  return dependency
}

export async function removeTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  removedBy: string,
): Promise<void> {
  const [task, dependsOnTask] = await Promise.all([
    getTaskById(taskId),
    getTaskById(dependsOnTaskId),
  ])

  const removed = await removeDependencyRepo(taskId, dependsOnTaskId)
  if (!removed) {
    throw new NotFoundError('Dependency', `${taskId} → ${dependsOnTaskId}`)
  }

  await eventBus.emit({
    type: 'dependency:removed',
    payload: {
      taskId,
      taskTitle: task?.title || 'Unknown',
      dependsOnTaskId,
      dependsOnTitle: dependsOnTask?.title || 'Unknown',
    },
    actor: removedBy,
    timestamp: Date.now(),
  })
}

export async function removeTaskDependencyById(
  dependencyId: string,
  _removedBy: string,
): Promise<void> {
  const removed = await removeDependencyById(dependencyId)
  if (!removed) {
    throw new NotFoundError('Dependency', dependencyId)
  }
}

/** Check if a task can be moved to DONE (all blockers resolved) */
export async function canMoveToDone(taskId: string): Promise<{
  allowed: boolean
  unresolvedCount: number
}> {
  const unresolvedCount = await getUnresolvedBlockerCount(taskId)
  return {
    allowed: unresolvedCount === 0,
    unresolvedCount,
  }
}

export { areAllBlockersResolved, getUnresolvedBlockerCount }
