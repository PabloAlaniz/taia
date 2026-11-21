import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { getAgentCostSummary } from '@taia/core/services/cost.service'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (req: NextRequest, context) => {
  const { agentId } = await context.params
  const period = req.nextUrl.searchParams.get('period') || undefined
  const summary = await getAgentCostSummary(agentId, period)
  return apiOk({ cost: summary })
})
