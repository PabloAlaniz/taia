import { NextRequest } from 'next/server'
import { apiOk, ValidationError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import {
  listTaskTrajectories,
  recordTaskTrajectory,
} from '@taia/core/services/task-trajectory.service'

function getWorkspaceId(req: NextRequest, body?: Record<string, unknown>): string {
  const searchWorkspace = req.nextUrl.searchParams.get('workspace_id')
  const headerWorkspace = req.headers.get('x-workspace-id')
  const bodyWorkspace = typeof body?.workspace_id === 'string' ? body.workspace_id : undefined
  const workspaceId = bodyWorkspace || searchWorkspace || headerWorkspace
  if (!workspaceId) throw new ValidationError('workspace_id is required')
  return workspaceId
}

export const GET = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const workspaceId = getWorkspaceId(req)
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50')
  const offset = Number(req.nextUrl.searchParams.get('offset') || '0')
  const result = await listTaskTrajectories({ workspaceId, taskId, limit, offset })
  return apiOk(result)
})

export const POST = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const body = (await req.json()) as Record<string, unknown>
  const workspaceId = getWorkspaceId(req, body)
  const decision = typeof body.decision === 'string' ? body.decision.trim() : ''
  if (!decision) throw new ValidationError('decision is required')

  const trajectory = await recordTaskTrajectory({
    workspaceId,
    taskId,
    actor: typeof body.actor === 'string' ? body.actor : undefined,
    decision,
    reasoning: typeof body.reasoning === 'string' ? body.reasoning : null,
    outcome: typeof body.outcome === 'string' ? body.outcome : null,
    metadata:
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null,
  })
  return apiOk({ trajectory })
})
