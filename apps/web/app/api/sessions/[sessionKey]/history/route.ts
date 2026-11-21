import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { SessionHistoryQuerySchema } from '@taia/core/validation/schemas'
import { getSessionDetail } from '@taia/core/services/session.service'

export const GET = withErrorBoundary(
  async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const { sessionKey } = await context.params
    const decodedKey = decodeURIComponent(sessionKey)

    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = validate(SessionHistoryQuerySchema, params)

    const detail = await getSessionDetail(decodedKey, {
      instanceId: query.instance,
      limit: query.limit,
      includeTools: query.include_tools,
    })

    if (!detail) {
      throw new NotFoundError('Session', decodedKey)
    }

    return apiOk({
      key: detail.key,
      sessionId: detail.sessionId,
      instanceId: detail.instanceId,
      agentId: detail.agentId,
      agentName: detail.agentName,
      model: detail.model,
      label: detail.label,
      status: detail.status,
      messages: detail.messages,
      totalTokens: detail.totalTokens,
      estimatedCostUsd: detail.estimatedCostUsd,
    })
  },
)
