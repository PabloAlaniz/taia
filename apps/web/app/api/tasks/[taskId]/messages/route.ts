import { NextResponse } from 'next/server'
import { listMessagesForTask, createMessageForTask } from '@taia/core/services/message.service'
import { validate } from '@taia/core/validation/validate'
import { CreateMessageSchema } from '@taia/core/validation/schemas'
import { apiError } from '@taia/core/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params
    const messages = await listMessagesForTask(taskId)
    return NextResponse.json({ messages })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params
    const body = await request.json()
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
