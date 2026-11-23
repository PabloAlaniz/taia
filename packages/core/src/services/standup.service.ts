// Standup service — daily standup report generation

import { getAllTasks, getActivities } from '../db/index'
import { getAgentDisplay } from '../agents/metadata'
import type { Task, Activity } from '@taia/types'
import { type TaskStage, type WorkspaceStages, taskStage } from './task-stage'
import { loadTaskStages } from './task-outcome'

const NO_COLUMNS: WorkspaceStages = new Map()

/** Tasks in one stage of their own board (see task-stage.ts). */
function inStage(tasks: Task[], stage: TaskStage, stages: WorkspaceStages): Task[] {
  return tasks.filter((t) => taskStage(t, stages) === stage)
}

/** Completed: in a done column, and not rejected. */
function completedTasks(tasks: Task[], stages: WorkspaceStages): Task[] {
  return inStage(tasks, 'done', stages).filter((t) => t.status !== 'REJECTED')
}

export interface StandupStats {
  total: number
  done: number
  inProgress: number
  review: number
  blocked: number
  needsClarification: number
  inbox: number
}

function formatStandup(
  tasks: Task[],
  activities: Activity[],
  stages: WorkspaceStages = NO_COLUMNS,
): string {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const completed = completedTasks(tasks, stages)
  const inProgress = inStage(tasks, 'in_progress', stages)
  const inReview = inStage(tasks, 'review', stages)
  const blocked = tasks.filter((t) => t.tags?.includes('blocked'))
  const needsClarification = tasks.filter((t) => t.tags?.includes('needs-clarification'))
  const inbox = inStage(tasks, 'todo', stages)

  // Today's activities
  const todayActivities = activities.filter((a) => new Date(a.created_at) >= todayStart)

  // Group completions by agent
  const completedByAgent: Record<string, string[]> = {}
  const completionActivities = todayActivities.filter((a) => a.type === 'task_completed')

  for (const activity of completionActivities) {
    if (activity.agent_id) {
      const task = tasks.find((t) => t.id === activity.task_id)
      if (task) {
        if (!completedByAgent[activity.agent_id]) {
          completedByAgent[activity.agent_id] = []
        }
        completedByAgent[activity.agent_id].push(task.title)
      }
    }
  }

  const lines: string[] = []

  lines.push(
    `📊 **DAILY STANDUP** — ${now.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`,
  )
  lines.push('')

  if (Object.keys(completedByAgent).length > 0) {
    lines.push('✅ **COMPLETADO HOY**')
    for (const [agentId, taskTitles] of Object.entries(completedByAgent)) {
      for (const title of taskTitles) {
        lines.push(`• ${getAgentDisplay(agentId)}: ${title}`)
      }
    }
    lines.push('')
  }

  if (needsClarification.length > 0) {
    lines.push('❓ **NECESITA CLARIFICACIÓN**')
    for (const task of needsClarification) {
      const agent = task.assigned_to ? getAgentDisplay(task.assigned_to) : 'Sin asignar'
      lines.push(`• ${agent}: ${task.title}`)
    }
    lines.push('')
  }

  if (blocked.length > 0) {
    lines.push('🚫 **BLOQUEADO**')
    for (const task of blocked) {
      const agent = task.assigned_to ? getAgentDisplay(task.assigned_to) : 'Sin asignar'
      lines.push(`• ${agent}: ${task.title}`)
    }
    lines.push('')
  }

  if (inProgress.length > 0) {
    lines.push('🔄 **EN PROGRESO**')
    for (const task of inProgress) {
      const agent = task.assigned_to ? getAgentDisplay(task.assigned_to) : 'Sin asignar'
      lines.push(`• ${agent}: ${task.title}`)
    }
    lines.push('')
  }

  if (inReview.length > 0) {
    lines.push('👀 **NECESITA REVIEW**')
    for (const task of inReview) {
      lines.push(`• ${task.title}`)
    }
    lines.push('')
  }

  if (inbox.length > 0) {
    lines.push(`📥 **INBOX** (${inbox.length} tasks esperando)`)
    for (const task of inbox.slice(0, 5)) {
      lines.push(`• ${task.title} [${task.priority}]`)
    }
    if (inbox.length > 5) {
      lines.push(`  ...y ${inbox.length - 5} más`)
    }
    lines.push('')
  }

  const todayMessages = todayActivities.filter((a) => a.type === 'message_sent').length
  if (todayMessages > 0) {
    lines.push(`💬 **ACTIVIDAD**: ${todayMessages} comentarios hoy`)
    lines.push('')
  }

  lines.push('📈 **STATS**')
  lines.push(`• Total tasks: ${tasks.length}`)
  lines.push(`• Done: ${completed.length}`)
  lines.push(`• Activos: ${inProgress.length + inReview.length}`)
  lines.push(`• Bloqueados: ${blocked.length + needsClarification.length}`)
  lines.push(`• Pendientes: ${inbox.length}`)

  return lines.join('\n')
}

function computeStats(tasks: Task[], stages: WorkspaceStages = NO_COLUMNS): StandupStats {
  return {
    total: tasks.length,
    done: completedTasks(tasks, stages).length,
    inProgress: inStage(tasks, 'in_progress', stages).length,
    review: inStage(tasks, 'review', stages).length,
    blocked: tasks.filter((t) => t.tags?.includes('blocked')).length,
    needsClarification: tasks.filter((t) => t.tags?.includes('needs-clarification')).length,
    inbox: inStage(tasks, 'todo', stages).length,
  }
}

/** The standup of one workspace, or of every workspace when none is given. */
export async function generateStandup(
  workspaceId?: string,
): Promise<{ standup: string; stats: StandupStats }> {
  const [tasks, activities, stages] = await Promise.all([
    getAllTasks(workspaceId ? { workspaceId } : undefined),
    getActivities(100, workspaceId) as Promise<Activity[]>,
    loadTaskStages(workspaceId),
  ])

  const standup = formatStandup(tasks, activities, stages)
  const stats = computeStats(tasks, stages)

  return { standup, stats }
}
