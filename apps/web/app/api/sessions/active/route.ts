import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { getActiveSessions } from '@taia/core/services/session.service'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async () => {
  const active = await getActiveSessions()

  return apiOk({ active, timestamp: Date.now() })
})
