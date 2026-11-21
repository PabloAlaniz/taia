import { NextRequest } from 'next/server'
import { generateSetup } from '@taia/core/services/setup.service'
import { apiOk, ValidationError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()

  if (!body.need || typeof body.need !== 'string' || body.need.length < 3) {
    throw new ValidationError('Field "need" is required (min 3 characters)')
  }

  const setup = await generateSetup(body.need)

  return apiOk({ setup })
})
