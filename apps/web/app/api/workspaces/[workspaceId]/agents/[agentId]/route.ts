export const dynamic = 'force-dynamic'

import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { removeAgentFromWorkspace } from '@taia/core/db'

export const DELETE = withErrorBoundary(async (_req, { params }) => {
  const { workspaceId, agentId } = await params
  await removeAgentFromWorkspace(workspaceId, agentId)
  return apiOk({ deleted: true })
})
