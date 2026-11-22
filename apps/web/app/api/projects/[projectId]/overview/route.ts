import { NextRequest } from 'next/server'
import { getProjectOverview } from '@taia/core/services/project.service'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[projectId]/overview
 *
 * The project, its repositories and its tasks grouped by workspace, each
 * group with that workspace's columns. Ignores X-Workspace-Id: a project
 * cuts across workspaces.
 */
export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { projectId } = await context.params
  const overview = await getProjectOverview(projectId)
  if (!overview) throw new NotFoundError('Project', projectId)
  return apiOk({ ...overview })
})
