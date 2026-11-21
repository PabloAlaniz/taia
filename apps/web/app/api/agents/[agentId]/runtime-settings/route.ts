import { NextRequest } from 'next/server'
import { getAgentById } from '@taia/core/db'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { validate } from '@taia/core/validation/validate'
import { UpdateAgentRuntimeSettingsSchema } from '@taia/core/validation/schemas'
import {
  getEffectiveAgentRuntimeSettings,
  updateAgentRuntimeSettings,
} from '@taia/core/services/agent-runtime-settings.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/[agentId]/runtime-settings
 *
 * The model, denied tools and workspace the agent runs with, where each one
 * comes from (`taia`, `runtime` or `default`), and what TAIA asks for.
 */
export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { agentId } = await context.params
  if (!(await getAgentById(agentId))) throw new NotFoundError('Agent', agentId)
  return apiOk({ ...(await getEffectiveAgentRuntimeSettings(agentId)) })
})

/**
 * PATCH /api/agents/[agentId]/runtime-settings
 * Body: { model?: { primary, fallbacks } | null, deniedTools?: string[] | null,
 *         workspace?: string | null } — null resets to the runtime default.
 *
 * The change is stored even when the runtime refuses it; `runtime` reports
 * how the runtime took it (null when it applies from the next session on).
 */
export const PATCH = withErrorBoundary(async (req: NextRequest, context) => {
  const { agentId } = await context.params
  if (!(await getAgentById(agentId))) throw new NotFoundError('Agent', agentId)
  const update = validate(UpdateAgentRuntimeSettingsSchema, await req.json())
  return apiOk({ agentId, ...(await updateAgentRuntimeSettings(agentId, update)) })
})
