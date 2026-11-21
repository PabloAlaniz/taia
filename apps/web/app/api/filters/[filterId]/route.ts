import { NextRequest } from 'next/server'
import { validate } from '@taia/core/validation/validate'
import { UpdateSavedFilterSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { getSavedFilterById, updateSavedFilter, deleteSavedFilter } from '@taia/core/db'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { filterId } = await context.params
  const filter = await getSavedFilterById(filterId)
  if (!filter) throw new NotFoundError('Filter', filterId)
  return apiOk({ filter })
})

export const PUT = withErrorBoundary(async (req: NextRequest, context) => {
  const { filterId } = await context.params
  const body = await req.json()
  const data = validate(UpdateSavedFilterSchema, body)
  const filter = await updateSavedFilter(filterId, data)
  if (!filter) throw new NotFoundError('Filter', filterId)
  return apiOk({ filter })
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { filterId } = await context.params
  const deleted = await deleteSavedFilter(filterId)
  if (!deleted) throw new NotFoundError('Filter', filterId)
  return apiOk({ deleted: true })
})
