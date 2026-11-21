/**
 * Activity Service — Centralized activity logging
 *
 * All activity logging flows through this service to ensure:
 * 1. Consistent activity format across all operations
 * 2. Single responsibility (repositories don't log, services do)
 * 3. Rich metadata for activity feed (diffs, context)
 *
 * Activity Types:
 * - task_created, task_updated, task_moved, task_completed, task_assigned, task_deleted
 * - task_tagged, task_untagged
 * - subtask_created, subtask_completed, subtask_deleted
 * - project_created, project_updated, project_deleted
 * - agent_updated, agent_triggered
 * - message_sent
 */

import { logActivity } from '../db/repositories/activity.repository'
import type { Task, TaskStatus, Subtask, Project } from '@taia/types'

// ─────────────────────────────────────────────────────────────────────────────
// Task Activities
// ─────────────────────────────────────────────────────────────────────────────

export async function logTaskCreated(task: Task, createdBy: string) {
  await logActivity({
    type: 'task_created',
    task_id: task.id,
    agent_id: createdBy,
    workspace_id: task.workspace_id,
    message: `Task created: ${task.title}`,
  })
}

export async function logTaskUpdated(
  task: Task,
  changes: Record<string, { from: unknown; to: unknown }>,
  updatedBy: string,
) {
  // Skip if no meaningful changes
  const changeKeys = Object.keys(changes)
  if (changeKeys.length === 0) return

  // Build human-readable change description
  const changeDescriptions = changeKeys.map((key) => {
    const { from, to } = changes[key]
    const fromStr = from === null || from === undefined ? 'none' : String(from)
    const toStr = to === null || to === undefined ? 'none' : String(to)
    return `${key}: ${fromStr} → ${toStr}`
  })

  await logActivity({
    type: 'task_updated',
    task_id: task.id,
    agent_id: updatedBy,
    message: `Task updated: ${task.title} (${changeDescriptions.join(', ')})`,
    metadata: { changes },
  })
}

export async function logTaskMoved(
  task: Task,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  movedBy: string,
  isDoneState?: boolean,
) {
  await logActivity({
    type: isDoneState ? 'task_completed' : 'task_moved',
    task_id: task.id,
    agent_id: movedBy,
    workspace_id: task.workspace_id,
    message: `Task moved ${fromStatus} → ${toStatus}: ${task.title}`,
    metadata: { from: fromStatus, to: toStatus },
  })
}

export async function logTaskAssigned(task: Task, assignedTo: string, assignedBy: string) {
  await logActivity({
    type: 'task_assigned',
    task_id: task.id,
    agent_id: assignedBy || assignedTo,
    message: `Task assigned to ${assignedTo}: ${task.title}`,
    metadata: { assigned_to: assignedTo },
  })
}

export async function logTaskDeleted(taskId: string, taskTitle: string, deletedBy: string) {
  await logActivity({
    type: 'task_deleted',
    task_id: taskId,
    agent_id: deletedBy,
    message: `Task deleted: ${taskTitle}`,
  })
}

export async function logTaskTagged(task: Task, tag: string, taggedBy: string) {
  await logActivity({
    type: 'task_tagged',
    task_id: task.id,
    agent_id: taggedBy,
    message: `Tag added to "${task.title}": ${tag}`,
    metadata: { tag },
  })
}

export async function logTaskUntagged(task: Task, tag: string, untaggedBy: string) {
  await logActivity({
    type: 'task_untagged',
    task_id: task.id,
    agent_id: untaggedBy,
    message: `Tag removed from "${task.title}": ${tag}`,
    metadata: { tag },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtask Activities
// ─────────────────────────────────────────────────────────────────────────────

export async function logSubtaskCreated(subtask: Subtask, taskTitle: string) {
  await logActivity({
    type: 'subtask_created',
    agent_id: 'system',
    task_id: subtask.task_id,
    message: `Subtask added to "${taskTitle}": ${subtask.title}`,
  })
}

export async function logSubtaskCompleted(subtask: Subtask, taskTitle: string, completed: boolean) {
  await logActivity({
    type: 'subtask_completed',
    agent_id: 'system',
    task_id: subtask.task_id,
    message: `Subtask ${completed ? 'completed' : 'reopened'}: ${subtask.title}`,
    metadata: { completed },
  })
}

export async function logSubtaskDeleted(taskId: string, subtaskTitle: string, taskTitle: string) {
  await logActivity({
    type: 'subtask_deleted',
    agent_id: 'system',
    task_id: taskId,
    message: `Subtask removed from "${taskTitle}": ${subtaskTitle}`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Activities
// ─────────────────────────────────────────────────────────────────────────────

export async function logProjectCreated(project: Project) {
  await logActivity({
    type: 'project_created',
    agent_id: 'system',
    message: `Project created: ${project.name}`,
    metadata: { project_id: project.id },
  })
}

export async function logProjectUpdated(
  project: Project,
  changes: Record<string, { from: unknown; to: unknown }>,
) {
  const changeKeys = Object.keys(changes)
  if (changeKeys.length === 0) return

  const changeDescriptions = changeKeys.map((key) => {
    const { from, to } = changes[key]
    return `${key}: ${from || 'none'} → ${to || 'none'}`
  })

  await logActivity({
    type: 'project_updated',
    agent_id: 'system',
    message: `Project updated: ${project.name} (${changeDescriptions.join(', ')})`,
    metadata: { project_id: project.id, changes },
  })
}

export async function logProjectDeleted(projectName: string, projectId: string) {
  await logActivity({
    type: 'project_deleted',
    agent_id: 'system',
    message: `Project deleted: ${projectName}`,
    metadata: { project_id: projectId },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Activities
// ─────────────────────────────────────────────────────────────────────────────

export async function logAgentUpdated(agentId: string, agentName: string, changes: string[]) {
  await logActivity({
    type: 'agent_updated',
    agent_id: agentId,
    message: `Agent "${agentName}" updated: ${changes.join(', ')}`,
  })
}

export async function logAgentTriggered(agentId: string, agentName: string, triggeredBy?: string) {
  await logActivity({
    type: 'agent_triggered',
    agent_id: agentId,
    message: `Agent "${agentName}" triggered manually`,
    metadata: { triggered_by: triggeredBy },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Activities
// ─────────────────────────────────────────────────────────────────────────────

export async function logDependencyAdded(
  taskId: string,
  taskTitle: string,
  dependsOnId: string,
  dependsOnTitle: string,
  addedBy: string,
) {
  await logActivity({
    type: 'dependency_added',
    task_id: taskId,
    agent_id: addedBy,
    message: `Dependency added: "${taskTitle}" now blocked by "${dependsOnTitle}"`,
    metadata: { depends_on_task_id: dependsOnId },
  })
}

export async function logDependencyRemoved(
  taskId: string,
  taskTitle: string,
  dependsOnId: string,
  dependsOnTitle: string,
  removedBy: string,
) {
  await logActivity({
    type: 'dependency_removed',
    task_id: taskId,
    agent_id: removedBy,
    message: `Dependency removed: "${taskTitle}" no longer blocked by "${dependsOnTitle}"`,
    metadata: { depends_on_task_id: dependsOnId },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Worktree Activities
// ─────────────────────────────────────────────────────────────────────────────

export async function logWorktreeCreated(taskId: string, branchName: string, createdBy: string) {
  await logActivity({
    type: 'worktree_created',
    task_id: taskId,
    agent_id: createdBy,
    message: `Worktree created: ${branchName}`,
    metadata: { branch: branchName },
  })
}

export async function logWorktreeMerged(taskId: string, branchName: string, strategy: string) {
  await logActivity({
    type: 'worktree_merged',
    agent_id: 'system',
    task_id: taskId,
    message: `Worktree merged (${strategy}): ${branchName}`,
    metadata: { branch: branchName, strategy },
  })
}

export async function logWorktreeFailed(taskId: string, branchName: string, error: string) {
  await logActivity({
    type: 'worktree_failed',
    agent_id: 'system',
    task_id: taskId,
    message: `Worktree failed: ${branchName} — ${error}`,
    metadata: { branch: branchName, error },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Compute changes between two objects
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic constraint must allow indexed access by string for any model row
export function computeChanges<T extends Record<string, any>>(
  before: T,
  after: Partial<T>,
  fieldsToTrack: (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}

  for (const field of fieldsToTrack) {
    const key = field as string
    if (key in after && before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] }
    }
  }

  return changes
}
