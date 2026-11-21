import { NextRequest, NextResponse } from 'next/server'
import { getActivities, getBoardActivities, logActivity } from '@taia/core/db'
import { apiError, ValidationError } from '@taia/core/errors'
import { requestWorkspaceId } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    // The board asks for its own workspace (query or header); without one,
    // every workspace is listed.
    const workspaceId = requestWorkspaceId(req, req.nextUrl.searchParams.get('workspace_id'))
    const activities = workspaceId
      ? await getBoardActivities(limit, workspaceId)
      : await getActivities(limit)
    return NextResponse.json({ activities })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.type || !body.message) {
      throw new ValidationError('type and message are required')
    }

    const activity = await logActivity({
      type: body.type,
      agent_id: body.agent_id || body.agentId,
      task_id: body.task_id || body.taskId,
      message: body.message,
      metadata: body.metadata,
    })

    return NextResponse.json({ activity })
  } catch (error) {
    return apiError(error)
  }
}
