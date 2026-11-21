import { setSetting } from '@taia/core/db'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const POST = withErrorBoundary(async () => {
  await setSetting('onboarding.completed', 'true')
  await setSetting('onboarding.completed_at', new Date().toISOString())

  return apiOk({})
})
