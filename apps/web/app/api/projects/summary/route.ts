import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { getProjectSummaries } from '@taia/core/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/summary — per project: task totals (done by each
 * workspace's own done column), workspaces it spans, spend and last activity.
 */
export const GET = withErrorBoundary(async () => {
  const summaries = await getProjectSummaries()
  return apiOk({ summaries })
})
