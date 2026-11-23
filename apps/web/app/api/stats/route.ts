import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@taia/core/errors'
import { getAllTasks } from '@taia/core/db'
import { requestWorkspaceId } from '@taia/core/api-handler'
import { isCompleted, isFinished, loadColumnStates } from '@taia/core/services/task-outcome'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stats?assigned_to=username (optional)
 *
 * Returns clean, reliable statistics for reporting.
 * Use this endpoint instead of manual queries to avoid stale/inconsistent data.
 *
 * Query params:
 * - assigned_to (optional): Filter "waiting" tasks for specific user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filterUser = searchParams.get('assigned_to')

    const workspaceId = requestWorkspaceId(request, searchParams.get('workspace_id'))
    const [allTasks, states] = await Promise.all([
      getAllTasks(workspaceId ? { workspaceId } : undefined),
      loadColumnStates(workspaceId ?? undefined),
    ])
    // Finished = any done column of the task's workspace (not only DONE).
    const finished = (t: (typeof allTasks)[number]) => isFinished(t, states)
    const now = Date.now()
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Waiting for approval (REVIEW or assigned to specific user, not done)
    const waitingApproval = allTasks.filter((t) => {
      if (finished(t)) return false

      if (filterUser) {
        return t.assigned_to === filterUser || t.status === 'REVIEW'
      } else {
        return t.status === 'REVIEW'
      }
    })

    // Blocked (tag + active status + >3 days old)
    const blocked = allTasks.filter((t) => {
      if (!t.tags?.includes('blocked')) return false
      if (finished(t)) return false
      if (t.status !== 'IN_PROGRESS' && t.status !== 'ASSIGNED') return false

      const createdAt = new Date(t.created_at).getTime()
      return createdAt < threeDaysAgo
    })

    // In progress by agent
    const inProgress = allTasks.filter((t) => t.status === 'IN_PROGRESS')
    const inProgressByAgent: Record<string, number> = {}
    inProgress.forEach((t) => {
      const agent = t.assigned_to || 'unassigned'
      inProgressByAgent[agent] = (inProgressByAgent[agent] || 0) + 1
    })

    // Completed today
    const completedToday = allTasks.filter((t) => {
      if (!isCompleted(t, states)) return false
      const completedAt = t.completed_at ? new Date(t.completed_at).getTime() : 0
      return completedAt > oneDayAgo
    })

    // Backlog
    const backlog = allTasks.filter((t) => t.status === 'INBOX' || t.status === 'IDEA')

    // Urgent priority tasks (not done)
    const urgent = allTasks.filter((t) => t.priority === 'URGENT' && !finished(t))

    const stats = {
      timestamp: new Date().toISOString(),
      filter: filterUser ? { assigned_to: filterUser } : null,

      // Critical metrics
      waitingApproval: {
        count: waitingApproval.length,
        tasks: waitingApproval.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status,
          assigned_to: t.assigned_to,
        })),
      },

      blocked: {
        count: blocked.length,
        tasks: blocked.map((t) => ({
          id: t.id,
          title: t.title,
          assigned_to: t.assigned_to,
          status: t.status,
          created_at: t.created_at,
          age_days: Math.floor((now - new Date(t.created_at).getTime()) / (24 * 60 * 60 * 1000)),
        })),
      },

      urgent: {
        count: urgent.length,
        tasks: urgent.map((t) => ({
          id: t.id,
          title: t.title,
          assigned_to: t.assigned_to,
          status: t.status,
        })),
      },

      // Informative metrics
      inProgress: {
        count: inProgress.length,
        byAgent: inProgressByAgent,
      },

      completedToday: {
        count: completedToday.length,
      },

      backlog: {
        count: backlog.length,
      },

      // Total counts by status
      byStatus: {
        INBOX: allTasks.filter((t) => t.status === 'INBOX').length,
        ASSIGNED: allTasks.filter((t) => t.status === 'ASSIGNED').length,
        IN_PROGRESS: allTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        REVIEW: allTasks.filter((t) => t.status === 'REVIEW').length,
        DONE: allTasks.filter((t) => t.status === 'DONE').length,
        REJECTED: allTasks.filter((t) => t.status === 'REJECTED').length,
        /** Every task in a done column, whatever the preset calls it. */
        completed: allTasks.filter((t) => isCompleted(t, states)).length,
        IDEA: allTasks.filter((t) => t.status === 'IDEA').length,
      },
    }

    return NextResponse.json(stats)
  } catch (error) {
    return apiError(error)
  }
}
