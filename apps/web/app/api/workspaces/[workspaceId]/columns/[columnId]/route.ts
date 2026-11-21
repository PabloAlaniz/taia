export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { NotFoundError } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { UpdateBoardColumnSchema } from '@taia/core/validation/schemas'
import { updateColumn, deleteColumn } from '@taia/core/db'

export const PUT = withErrorBoundary(async (req: NextRequest, { params }) => {
  const { columnId } = await params
  const body = await req.json()
  const data = validate(UpdateBoardColumnSchema, body)
  const column = await updateColumn(columnId, data)
  if (!column) throw new NotFoundError('Column', columnId)
  return apiOk({ column })
})

export const DELETE = withErrorBoundary(async (_req, { params }) => {
  const { columnId } = await params
  const deleted = await deleteColumn(columnId)
  if (!deleted) throw new NotFoundError('Column', columnId)
  return apiOk({ deleted: true })
})
