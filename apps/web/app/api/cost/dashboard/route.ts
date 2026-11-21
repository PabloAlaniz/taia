import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { validate } from '@taia/core/validation/validate'
import { CostDashboardQuerySchema } from '@taia/core/validation/schemas'
import { getDashboardMetrics } from '@taia/core/services/cost.service'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const { period } = validate(CostDashboardQuerySchema, params)
  const metrics = await getDashboardMetrics(period)
  return apiOk({ metrics })
})
