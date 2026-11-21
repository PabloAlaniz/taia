import { getSetting } from '@taia/core/db'
import { getDefaultInstanceConfig } from '@taia/core/runtime-instances'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async () => {
  const completed = await getSetting('onboarding.completed')
  // Provider-agnostic: a runtime is "configured" when the default instance has
  // what it needs (URL, token or command); standalone mode never is.
  const runtime = await getDefaultInstanceConfig()

  return apiOk({
    completed: completed === 'true',
    provider: runtime.provider,
    runtime_configured: runtime.configured,
    /** @deprecated use runtime_configured */
    gateway_configured: runtime.configured,
  })
})
