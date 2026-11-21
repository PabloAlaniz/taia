import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { SessionListQuerySchema } from '@taia/core/validation/schemas'
import { listSessions } from '@taia/core/services/session.service'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const query = validate(SessionListQuerySchema, params)

  const sessions = await listSessions({
    agentId: query.agent_id,
    status: query.status,
    limit: query.limit,
  })

  return apiOk({ sessions })
})
