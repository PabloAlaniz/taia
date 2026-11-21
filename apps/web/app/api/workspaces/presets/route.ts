export const dynamic = 'force-dynamic'

import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { listPresets } from '@taia/core/services/workspace.service'

export const GET = withErrorBoundary(async () => {
  const presets = await listPresets()
  return apiOk({ presets })
})
