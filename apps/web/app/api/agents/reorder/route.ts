import { NextRequest } from 'next/server'
import { reorderAgents } from '@taia/core/db'
import { apiOk, ValidationError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { orderedIds } = await req.json()

  if (!Array.isArray(orderedIds)) {
    throw new ValidationError('orderedIds must be an array of agent IDs')
  }

  await reorderAgents(orderedIds)
  return apiOk({})
})
