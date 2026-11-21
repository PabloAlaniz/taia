import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { listQaPipelineRuns, runQaPipeline } from '@taia/core/services/qa-pipeline.service'

export const dynamic = 'force-dynamic'

function getWorkspaceId(req: NextRequest) {
  return (
    req.headers.get('x-workspace-id') ||
    req.nextUrl.searchParams.get('workspace_id') ||
    'ws-default'
  )
}

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const workspaceId = getWorkspaceId(req)
  const taskId = req.nextUrl.searchParams.get('task_id') || undefined
  const runs = await listQaPipelineRuns(workspaceId, taskId)
  return apiOk({ runs })
})

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const workspaceId = getWorkspaceId(req)
  const body = await req.json()
  const run = await runQaPipeline({ ...body, workspace_id: workspaceId })
  return apiOk({ run }, 201)
})
