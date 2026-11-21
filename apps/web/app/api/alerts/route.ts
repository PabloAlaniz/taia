import { NextResponse } from 'next/server'
import { getAllTasks, getActivities } from '@taia/core/db'
import { checkAndAlert, sendAlert, generateDailySummary } from '@taia/core/alerts'
import { apiError, ValidationError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shouldSend = searchParams.get('send') === 'true'
  const sendSummary = searchParams.get('summary') === 'true'

  try {
    const tasks = await getAllTasks()
    const activities = await getActivities(50)

    if (sendSummary) {
      const summary = generateDailySummary(tasks, activities)
      if (shouldSend) {
        const sent = await sendAlert(summary)
        return NextResponse.json({ ok: true, summary, sent })
      }
      return NextResponse.json({ ok: true, summary, sent: false })
    }

    const alerts = await checkAndAlert(tasks)

    if (shouldSend && alerts.length > 0) {
      const message = alerts.join('\n\n')
      const sent = await sendAlert(message)
      return NextResponse.json({ ok: true, alerts, sent })
    }

    return NextResponse.json({ ok: true, alerts, sent: false })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { message } = await request.json()
    if (!message) throw new ValidationError('Message is required')

    const sent = await sendAlert(message)
    return NextResponse.json({ ok: true, sent })
  } catch (error) {
    return apiError(error)
  }
}
