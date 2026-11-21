import { getEnrichmentStatus } from '@taia/core/services/enrichment.service'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async () => {
  const status = await getEnrichmentStatus()
  return apiOk({ status })
})
