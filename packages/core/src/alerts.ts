// TAIA Alerts
// Sends notifications through the active runtime's channel integrations
// (capability: Messaging), e.g. OpenClaw's Telegram channel.

import { Task } from '@taia/types'
import { RuntimeCapability } from '@taia/runtime'
import { Activity, getSetting } from './db/index'
import { getDefaultRuntimeAdapter } from './runtime'

interface AlertConfig {
  enabled: boolean
  reviewAlertMinutes: number // Alert if in REVIEW for this long
  blockedAlertMinutes: number // Alert if BLOCKED for this long
  staleAlertHours: number // Alert if no movement for this long
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  reviewAlertMinutes: 60,
  blockedAlertMinutes: 120,
  staleAlertHours: 24,
}

const DEFAULT_ALERT_CHANNEL = 'telegram'

async function readSetting(key: string): Promise<string | undefined> {
  try {
    return (await getSetting(key)) || undefined
  } catch {
    return undefined
  }
}

/**
 * Deliver an alert via the active runtime. Channel comes from `alerts.channel`
 * (default `telegram`) and the recipient from `telegram_target`. Returns false
 * when there is no recipient, the runtime can't deliver messages, or delivery
 * fails.
 */
export async function sendAlert(message: string): Promise<boolean> {
  try {
    const target = await readSetting('telegram_target')
    if (!target) {
      console.warn('Alert target not configured. Set "telegram_target" in settings.')
      return false
    }
    const adapter = await getDefaultRuntimeAdapter()
    if (!adapter.capabilities.has(RuntimeCapability.Messaging) || !adapter.sendChannelMessage) {
      console.warn(`Runtime "${adapter.id}" cannot deliver alerts (no messaging capability).`)
      return false
    }
    const channel = (await readSetting('alerts.channel')) || DEFAULT_ALERT_CHANNEL
    await adapter.sendChannelMessage({ channel, target, text: message })
    return true
  } catch (e) {
    console.error('Failed to send alert:', e)
    return false
  }
}

/** @deprecated use {@link sendAlert} */
export const sendTelegramAlert = sendAlert

export async function checkAndAlert(tasks: Task[]): Promise<string[]> {
  if (!DEFAULT_CONFIG.enabled) return []

  const alerts: string[] = []
  const now = new Date()

  // Tasks in REVIEW for too long
  const reviewTasks = tasks.filter((t) => {
    if (t.status !== 'REVIEW') return false
    const updated = new Date(t.updated_at)
    const minutesInReview = (now.getTime() - updated.getTime()) / 60000
    return minutesInReview >= DEFAULT_CONFIG.reviewAlertMinutes
  })

  if (reviewTasks.length > 0) {
    alerts.push(
      `👀 ${reviewTasks.length} task(s) waiting for review:\n${reviewTasks.map((t) => `• ${t.title}`).join('\n')}`,
    )
  }

  // Tasks BLOCKED for too long (blocked is now a tag)
  const blockedTasks = tasks.filter((t) => {
    if (!t.tags?.includes('blocked') && !t.tags?.includes('needs-clarification')) return false
    const updated = new Date(t.updated_at)
    const minutesBlocked = (now.getTime() - updated.getTime()) / 60000
    return minutesBlocked >= DEFAULT_CONFIG.blockedAlertMinutes
  })

  if (blockedTasks.length > 0) {
    alerts.push(
      `🚫 ${blockedTasks.length} task(s) blocked:\n${blockedTasks.map((t) => `• ${t.title}`).join('\n')}`,
    )
  }

  // Stale tasks (ASSIGNED but no movement)
  const staleHours = DEFAULT_CONFIG.staleAlertHours
  const staleTasks = tasks.filter((t) => {
    if (t.status !== 'ASSIGNED') return false
    const updated = new Date(t.updated_at)
    const hoursStale = (now.getTime() - updated.getTime()) / 3600000
    return hoursStale >= staleHours
  })

  if (staleTasks.length > 0) {
    alerts.push(
      `⚠️ ${staleTasks.length} stale task(s) (assigned >${staleHours}h):\n${staleTasks.map((t) => `• ${t.title} → ${t.assigned_to}`).join('\n')}`,
    )
  }

  return alerts
}

export function generateDailySummary(tasks: Task[], _activities: Activity[]): string {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const completedToday = tasks.filter(
    (t) => t.status === 'DONE' && t.completed_at && new Date(t.completed_at) >= todayStart,
  )

  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS')
  const blocked = tasks.filter(
    (t) => t.tags?.includes('blocked') || t.tags?.includes('needs-clarification'),
  )
  const review = tasks.filter((t) => t.status === 'REVIEW')
  const inbox = tasks.filter((t) => t.status === 'INBOX')

  const totalTimeToday = completedToday.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0)
  const timeStr =
    totalTimeToday > 0
      ? ` (${Math.floor(totalTimeToday / 60)}h ${totalTimeToday % 60}m tracked)`
      : ''

  let summary = `📊 *TAIA - Resumen Diario*\n\n`
  summary += `✅ Completed today: ${completedToday.length}${timeStr}\n`
  summary += `🔨 In progress: ${inProgress.length}\n`
  summary += `👀 Waiting review: ${review.length}\n`
  summary += `🚫 Blocked: ${blocked.length}\n`
  summary += `📥 Inbox: ${inbox.length}\n`

  if (completedToday.length > 0) {
    summary += `\n*Completed:*\n`
    completedToday.slice(0, 5).forEach((t) => {
      summary += `• ${t.title}\n`
    })
    if (completedToday.length > 5) {
      summary += `_...and ${completedToday.length - 5} more_\n`
    }
  }

  if (review.length > 0) {
    summary += `\n*Needs review:*\n`
    review.forEach((t) => {
      summary += `• ${t.title}\n`
    })
  }

  return summary
}
