'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { Activity } from '@taia/types'
import { useStore } from './store'

/** The title the backend appended after the last ": " (its messages end with it). */
function titleFromMessage(message: string): string {
  const i = message.lastIndexOf(': ')
  return i >= 0 ? message.slice(i + 2) : message
}

/**
 * Activity lines in the reader's language. The backend stores an English
 * sentence plus a typed event; we rebuild the sentence from the event and
 * the board's own names (task titles, column labels, people), and fall back
 * to the stored text for events we don't know.
 */
export function useActivityText() {
  const t = useTranslations('activityText')
  const tasks = useStore((s) => s.tasks)
  const agents = useStore((s) => s.agents)
  const columns = useStore((s) => s.boardColumns)

  return useCallback(
    (a: Activity): string => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>
      const title = tasks.find((x) => x.id === a.task_id)?.title ?? titleFromMessage(a.message)
      const column = (slug: unknown) =>
        typeof slug === 'string' ? (columns.find((c) => c.slug === slug)?.label ?? slug) : ''
      const who = (id: unknown) =>
        typeof id === 'string' ? (agents.find((x) => x.id === id)?.name ?? id) : ''
      const tag = typeof meta.tag === 'string' ? meta.tag : ''

      switch (a.type) {
        case 'task_created':
          return t('taskCreated', { title })
        case 'task_moved':
          return t('taskMoved', { title, from: column(meta.from), to: column(meta.to) })
        case 'task_completed':
          return t('taskCompleted', { title, to: column(meta.to) })
        case 'task_assigned':
          return t('taskAssigned', { title, who: who(meta.assigned_to) })
        case 'task_updated': {
          const changes = Object.keys((meta.changes as Record<string, unknown>) ?? {})
          return t('taskUpdated', { title, count: changes.length })
        }
        case 'task_deleted':
          return t('taskDeleted', { title: titleFromMessage(a.message) })
        case 'task_tagged':
          return t('taskTagged', { title, tag })
        case 'task_untagged':
          return t('taskUntagged', { title, tag })
        case 'subtask_created':
          return t('subtaskCreated', { title })
        case 'subtask_completed':
          return a.message.startsWith('Subtask reopened')
            ? t('subtaskReopened', { subtask: titleFromMessage(a.message) })
            : t('subtaskCompleted', { subtask: titleFromMessage(a.message) })
        case 'project_created':
          return t('projectCreated', { name: titleFromMessage(a.message) })
        default:
          return a.message
      }
    },
    [t, tasks, agents, columns],
  )
}
