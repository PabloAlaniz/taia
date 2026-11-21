import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PRIORITY_COLORS = {
  LOW: '#666',
  MEDIUM: '#3b82f6',
  HIGH: '#f97316',
  URGENT: '#ef4444',
} as const

export const COLUMN_LABELS = {
  IDEA: '💡 Ideas',
  INBOX: '📥 Inbox',
  ASSIGNED: '👤 Assigned',
  IN_PROGRESS: '🔨 Progress',
  REVIEW: '👀 Review',
  DONE: '✅ Done',
  REJECTED: '🚫 Rejected',
} as const

export const ACTIVITY_ICONS = {
  // Tasks
  task_created: '📝',
  task_updated: '✏️',
  task_assigned: '🎯',
  task_moved: '↗️',
  task_completed: '✅',
  task_deleted: '🗑️',
  task_tagged: '🏷️',
  task_untagged: '🏷️',
  // Subtasks
  subtask_created: '☑️',
  subtask_completed: '☑️',
  subtask_deleted: '☑️',
  // Projects
  project_created: '📁',
  project_updated: '📁',
  project_deleted: '📁',
  // Messages
  message_sent: '💬',
  // Agents
  agent_started: '🚀',
  agent_finished: '🏁',
  agent_updated: '🤖',
  agent_triggered: '⚡',
  mention: '@',
} as const

export function timeUntil(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  if (diffMs < 0) return 'now'
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `in ${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `in ${diffHours}h`
}

export function formatRelativeTime(iso: string): string {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T')
  const withTz =
    normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + 'Z'
  const date = new Date(withTz)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/** Link to a session's transcript; the instance spares the lookup of its owner. */
export function sessionHref(sessionKey: string, instanceId?: string): string {
  const query = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : ''
  return `/sessions/${encodeURIComponent(sessionKey)}${query}`
}
