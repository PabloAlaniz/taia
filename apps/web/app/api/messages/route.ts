import { NextRequest, NextResponse } from 'next/server'
import { listMessagesForTask, createMessageForTask } from '@taia/core/services/message.service'
import { validate } from '@taia/core/validation/validate'
import { CreateMessageSchema } from '@taia/core/validation/schemas'
import { apiError, ValidationError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('taskId')
    if (!taskId) {
      throw new ValidationError('taskId query parameter is required')
    }
    const messages = await listMessagesForTask(taskId)
    return NextResponse.json({ messages })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    let body
    try {
      body = await req.json()
    } catch (e) {
      return NextResponse.json(
        {
          error: 'Invalid JSON in request body',
          details: e instanceof Error ? e.message : 'Unknown error',
        },
        { status: 400 },
      )
    }

    const taskId = body.task_id || body.taskId
    if (!taskId || typeof taskId !== 'string') {
      return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
    }

    const data = validate(CreateMessageSchema, body)

    const message = await createMessageForTask({
      task_id: taskId,
      from_agent_id: data.from_agent_id || data.fromAgentId!,
      content: data.content,
    })

    return NextResponse.json({ message })
  } catch (error) {
    return apiError(error)
  }
}
