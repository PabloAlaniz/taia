// Task service — business logic between routes and repositories
//
// Side effects (activity logging, broadcasting, worktree auto-create)
// are handled by event bus listeners, keeping this service focused on business logic.

import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
  assignTask,
  getAgentById,
} from '../db/index'
import { computeChanges } from './activity.service'
import { eventBus } from '../events/event-bus'
import { isSystemActor } from '../constants'
import { AppError } from '../errors'
import type { Task, TaskStatus, TaskPriority, Confidence } from '@taia/types'

async function validateActor(actorId: string): Promise<void> {
  if (isSystemActor(actorId)) return
  const agent = await getAgentById(actorId)
  if (!agent) {
    throw new AppError(
      `Invalid actor '${actorId}': not a registered agent or system actor`,
      400,
      'INVALID_ACTOR',
    )
  }
}

// Fields to track for activity logging (changes to these get logged)
const TRACKED_FIELDS: (keyof Task)[] = [
  'title',
  'description',
  'priority',
  'confidence',
  'project',
  'project_id',
  'due_date',
  'estimated_minutes',
]

export interface TaskFilters {
  status?: string
  project?: string
  project_id?: string
  assigned_to?: string
  priority?: string
  q?: string
  done_since_days?: number
  workspace_id?: string
}

export async function listTasks(
  filters: TaskFilters = {},
): Promise<{ tasks: Task[]; total: number }> {
  const options: { archiveBefore?: Date; workspaceId?: string } = {}
  if (filters.done_since_days) {
    options.archiveBefore = new Date(Date.now() - filters.done_since_days * 86_400_000)
  }
  if (filters.workspace_id) {
    options.workspaceId = filters.workspace_id
  }
  let tasks = await getAllTasks(Object.keys(options).length > 0 ? options : undefined)

  if (filters.status) {
    tasks = tasks.filter((t) => t.status === filters.status!.toUpperCase())
  }
  if (filters.project) {
    tasks = tasks.filter((t) => t.project === filters.project)
  }
  if (filters.project_id) {
    tasks = tasks.filter((t) => t.project_id === filters.project_id)
  }
  if (filters.assigned_to) {
    tasks = tasks.filter((t) => t.assigned_to === filters.assigned_to)
  }
  if (filters.priority) {
    tasks = tasks.filter((t) => t.priority === filters.priority!.toUpperCase())
  }
  if (filters.q) {
    const q = filters.q.toLowerCase()
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
  }

  return { tasks, total: tasks.length }
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  return getTaskById(taskId)
}

async function workspaceColumns(workspaceId: string) {
  const { getWorkspaceColumns } = await import('./workspace.service')
  return getWorkspaceColumns(workspaceId)
}

/**
 * A task's status is one of its workspace's column slugs. Workspaces with no
 * columns yet (before onboarding) accept any status.
 */
async function assertStatusInWorkspace(workspaceId: string, status: string): Promise<void> {
  const slugs = (await workspaceColumns(workspaceId)).map((column) => column.slug)
  if (slugs.length > 0 && !slugs.includes(status)) {
    throw new AppError(
      `Status "${status}" is not a column of workspace ${workspaceId} (${slugs.join(', ')})`,
      400,
      'INVALID_STATUS',
    )
  }
}

export async function createTaskWithBroadcast(data: {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  confidence?: Confidence
  project?: string
  project_id?: string
  workspace_id?: string
  repo_url?: string
  tags?: string[]
  assigned_to?: string
  created_by: string
  estimated_minutes?: number
}): Promise<Task> {
  await validateActor(data.created_by)
  const workspaceId = data.workspace_id || 'ws-default'
  if (data.status) {
    await assertStatusInWorkspace(workspaceId, data.status)
  } else {
    // No status: the workspace's initial column (or ASSIGNED when the task
    // comes assigned and the board has that column).
    const columns = await workspaceColumns(workspaceId)
    if (columns.length > 0) {
      const slugs = columns.map((column) => column.slug)
      const initial = columns.find((column) => column.is_initial_state) ?? columns[0]
      data = {
        ...data,
        status: data.assigned_to && slugs.includes('ASSIGNED') ? 'ASSIGNED' : initial.slug,
      }
    }
  }
  const task = await createTask(data)

  await eventBus.emit({
    type: 'task:created',
    payload: { task },
    actor: data.created_by,
    timestamp: Date.now(),
  })

  return task
}

export async function updateTaskWithBroadcast(
  taskId: string,
  updates: Partial<Task>,
  updatedBy: string,
): Promise<Task | null> {
  await validateActor(updatedBy)
  const before = await getTaskById(taskId)
  if (!before) return null
  if (updates.status && updates.status !== before.status) {
    await assertStatusInWorkspace(before.workspace_id || 'ws-default', updates.status)
  }

  const task = await updateTask(taskId, updates)
  if (!task) return null

  await eventBus.emit({
    type: 'task:updated',
    payload: {
      task,
      oldStatus: before.status,
      newStatus: updates.status,
      newAssignee:
        updates.assigned_to !== undefined && updates.assigned_to !== before.assigned_to
          ? updates.assigned_to
          : undefined,
      changes: computeChanges(before, updates, TRACKED_FIELDS),
    },
    actor: updatedBy,
    timestamp: Date.now(),
  })

  return task
}

export async function moveTaskWithBroadcast(
  taskId: string,
  status: TaskStatus,
  agentId: string,
): Promise<Task | null> {
  await validateActor(agentId)
  // Block move to done-state if task has unresolved dependencies
  const existingTask = await getTaskById(taskId)
  if (existingTask) {
    await assertStatusInWorkspace(existingTask.workspace_id || 'ws-default', status)
    const { isDoneStatus } = await import('./workspace.service')
    const isDone = existingTask.workspace_id
      ? await isDoneStatus(existingTask.workspace_id, status)
      : false
    if (isDone) {
      const { canMoveToDone } = await import('./dependency.service')
      const { allowed, unresolvedCount } = await canMoveToDone(taskId)
      if (!allowed) {
        throw new (await import('../errors')).AppError(
          `Cannot move to done: task has ${unresolvedCount} unresolved dependency(ies)`,
          400,
          'UNRESOLVED_DEPENDENCIES',
        )
      }
    }
  }

  const result = await moveTask(taskId, status, agentId)
  if (!result) return null

  const { task, oldStatus } = result

  await eventBus.emit({
    type: 'task:moved',
    payload: { task, oldStatus, newStatus: status },
    actor: agentId,
    timestamp: Date.now(),
  })

  return task
}

export async function deleteTaskWithBroadcast(taskId: string, deletedBy: string): Promise<void> {
  await validateActor(deletedBy)
  const task = await getTaskById(taskId)
  const taskTitle = task?.title || 'Unknown'

  await deleteTask(taskId)

  await eventBus.emit({
    type: 'task:deleted',
    payload: { taskId, taskTitle },
    actor: deletedBy,
    timestamp: Date.now(),
  })
}

export async function assignTaskWithBroadcast(
  taskId: string,
  agentId: string,
  assignedBy: string,
): Promise<Task | null> {
  await validateActor(assignedBy)
  const task = await assignTask(taskId, agentId)
  if (!task) return null

  await eventBus.emit({
    type: 'task:assigned',
    payload: { task, agentId },
    actor: assignedBy,
    timestamp: Date.now(),
  })

  return task
}
