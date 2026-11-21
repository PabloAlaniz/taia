import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { getTaskCostBreakdown } from '@taia/core/services/cost.service'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { taskId } = await context.params
  const breakdown = await getTaskCostBreakdown(taskId)
  return apiOk({ cost: breakdown })
})
