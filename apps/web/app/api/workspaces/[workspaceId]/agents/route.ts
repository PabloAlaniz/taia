export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { WorkspaceAgentsSchema } from '@taia/core/validation/schemas'
import { getAgentsForWorkspace, addAgentToWorkspace } from '@taia/core/db'

export const GET = withErrorBoundary(async (_req, { params }) => {
  const { workspaceId } = await params
  const agents = await getAgentsForWorkspace(workspaceId)
  return apiOk({ agents })
})

export const POST = withErrorBoundary(async (req: NextRequest, { params }) => {
  const { workspaceId } = await params
  const body = await req.json()
  const { agent_ids } = validate(WorkspaceAgentsSchema, body)
  for (const agentId of agent_ids) {
    await addAgentToWorkspace(workspaceId, agentId)
  }
  const agents = await getAgentsForWorkspace(workspaceId)
  return apiOk({ agents })
})
