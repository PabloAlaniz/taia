import { NextRequest, NextResponse } from 'next/server'
import {
  getUndeliveredNotifications,
  getNotificationsForAgent,
  markNotificationDelivered,
  markNotificationFailed,
  incrementNotificationAttempt,
  createNotification,
} from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { NotificationActionSchema } from '@taia/core/validation/schemas'
import { apiError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get('agentId')
    const undeliveredOnly = req.nextUrl.searchParams.get('undelivered') === 'true'

    if (undeliveredOnly) {
      const notifications = await getUndeliveredNotifications()
      return NextResponse.json({ notifications })
    }

    if (agentId) {
      const notifications = await getNotificationsForAgent(agentId)
      return NextResponse.json({ notifications })
    }

    const notifications = await getUndeliveredNotifications()
    return NextResponse.json({ notifications })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = validate(NotificationActionSchema, body)

    if (data.action === 'deliver') {
      const success = await markNotificationDelivered(data.notificationId)
      return NextResponse.json({ ok: success })
    }

    if (data.action === 'fail') {
      const success = await markNotificationFailed(data.notificationId, data.attempts || 0)
      return NextResponse.json({ ok: success })
    }

    if (data.action === 'retry') {
      const success = await incrementNotificationAttempt(
        data.notificationId,
        data.attempts,
        data.nextRetryAt,
      )
      return NextResponse.json({ ok: success })
    }

    if (data.action === 'create') {
      const notification = await createNotification({
        mentioned_agent_id: data.mentioned_agent_id,
        from_agent_id: data.from_agent_id,
        task_id: data.task_id,
        content: data.content,
      })

      if (!notification) {
        return NextResponse.json({ ok: true, message: 'Duplicate notification ignored' })
      }

      return NextResponse.json({ notification })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return apiError(error)
  }
}
