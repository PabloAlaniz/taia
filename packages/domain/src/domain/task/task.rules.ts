// Pure business rules for tasks — no I/O, no imports from DB/infra

import type { TaskStatus } from '@taia/types'

/**
 * When creating a task, determine the effective status.
 * If assigned_to is set and no explicit status, default to ASSIGNED.
 * initialSlug: the workspace's initial column slug (replaces hardcoded 'INBOX')
 */
export function defaultStatusOnCreate(
  explicitStatus?: TaskStatus,
  assignedTo?: string,
  initialSlug: TaskStatus = 'INBOX',
): TaskStatus {
  if (explicitStatus) return explicitStatus
  return assignedTo ? 'ASSIGNED' : initialSlug
}

/**
 * When updating a task, auto-transition from initial state → ASSIGNED if assigning.
 * Returns the status to set, or undefined if no auto-transition needed.
 * initialSlugs: slugs of columns marked as initial state in the workspace
 */
export function defaultStatusOnAssign(
  currentStatus: TaskStatus,
  newAssignedTo?: string,
  explicitNewStatus?: TaskStatus,
  initialSlugs: string[] = ['INBOX'],
): TaskStatus | undefined {
  if (newAssignedTo && initialSlugs.includes(currentStatus) && !explicitNewStatus) {
    return 'ASSIGNED'
  }
  return undefined
}

/**
 * Determine the activity type for a status move.
 * doneSlugs: slugs of columns marked as done state in the workspace
 */
export function activityTypeForMove(
  newStatus: TaskStatus,
  doneSlugs: string[] = ['DONE', 'REJECTED'],
): string {
  return doneSlugs.includes(newStatus) ? 'task_completed' : 'task_moved'
}
