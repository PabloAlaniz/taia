import { NextRequest, NextResponse } from 'next/server'
import {
  listTasks,
  createTaskWithBroadcast,
  moveTaskWithBroadcast,
  updateTaskWithBroadcast,
} from '@taia/core/services/task.service'
import { validate } from '@taia/core/validation/validate'
import { TaskActionSchema } from '@taia/core/validation/schemas'
import { apiError } from '@taia/core/errors'
import { requestWorkspaceId } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const doneSinceDays = searchParams.get('done_since_days')
    const result = await listTasks({
      status: searchParams.get('status') || undefined,
      project: searchParams.get('project') || undefined,
      project_id: searchParams.get('project_id') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      priority: searchParams.get('priority') || undefined,
      q: searchParams.get('q') || undefined,
      workspace_id: requestWorkspaceId(request, searchParams.get('workspace_id')),
      done_since_days: doneSinceDays ? parseInt(doneSinceDays, 10) : undefined,
    })
    return NextResponse.json(result)
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
        { error: 'Invalid JSON', details: e instanceof Error ? e.message : 'Parse error' },
        { status: 400 },
      )
    }

    const data = validate(TaskActionSchema, body)

    if (data.action === 'move') {
      const task = await moveTaskWithBroadcast(data.taskId, data.status, data.agentId || 'web-ui')
      return NextResponse.json({ task })
    }

    if (data.action === 'create') {
      const task = await createTaskWithBroadcast({
        ...data.task,
        workspace_id: requestWorkspaceId(req, data.task.workspace_id),
      })
      return NextResponse.json({ task })
    }

    if (data.action === 'update') {
      const task = await updateTaskWithBroadcast(data.taskId, data.updates, 'web-ui')
      return NextResponse.json({ task })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return apiError(error)
  }
}
