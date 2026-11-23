import { NextRequest } from 'next/server'
import { apiOk, ValidationError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { getTaskCosts } from '@taia/core/db'

export const dynamic = 'force-dynamic'

const MAX_IDS = 500

/**
 * GET /api/cost/tasks?ids=a,b,c — cost in USD per task, summed over its
 * sessions. The board asks once for every visible card. Tasks without
 * sessions are absent from `costs`.
 */
export const GET = withErrorBoundary(async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
  if (ids.length > MAX_IDS) {
    throw new ValidationError(`At most ${MAX_IDS} task ids per request`)
  }
  const costs = await getTaskCosts(ids)
  return apiOk({ costs })
})
