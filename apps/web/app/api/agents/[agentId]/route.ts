import { NextRequest } from 'next/server'
import { getAgentById, updateAgent } from '@taia/core/db'
import { removeAgent } from '@taia/core/services/agent.service'
import { validate } from '@taia/core/validation/validate'
import { UpdateAgentSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { logAgentUpdated } from '@taia/core/services/activity.service'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { agentId } = await context.params
  const agent = await getAgentById(agentId)
  if (!agent) throw new NotFoundError('Agent', agentId)
  return apiOk({ agent })
})

export const PUT = withErrorBoundary(async (req: NextRequest, context) => {
  const { agentId } = await context.params
  const body = await req.json()
  const updates = validate(UpdateAgentSchema, body)

  // Get before state
  const before = await getAgentById(agentId)
  if (!before) throw new NotFoundError('Agent', agentId)

  const agent = await updateAgent(agentId, updates)
  if (!agent) throw new NotFoundError('Agent', agentId)

  // Log activity with changed fields
  const changedFields: string[] = []
  if (updates.name && updates.name !== before.name) changedFields.push('name')
  if (updates.role && updates.role !== before.role) changedFields.push('role')
  if (updates.avatar && updates.avatar !== before.avatar) changedFields.push('avatar')
  if (updates.enabled !== undefined && updates.enabled !== before.enabled)
    changedFields.push('enabled')

  if (changedFields.length > 0) {
    await logAgentUpdated(agentId, agent.name, changedFields)
  }

  return apiOk({ agent })
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { agentId } = await context.params
  const removed = await removeAgent(agentId)
  if (!removed) throw new NotFoundError('Agent', agentId)
  return apiOk({ ...removed })
})
