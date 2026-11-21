import { NextRequest } from 'next/server'
import { applySetup } from '@taia/core/services/setup.service'
import type { SetupResult } from '@taia/core/services/setup.service'
import { apiOk, ValidationError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()

  if (!body.setup?.workspace || !body.setup?.agents) {
    throw new ValidationError('Field "setup" with workspace and agents is required')
  }

  const result = await applySetup(body.setup as SetupResult, body.useDefaultWorkspace !== false)

  return apiOk({ result })
})
