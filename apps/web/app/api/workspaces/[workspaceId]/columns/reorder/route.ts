export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { ReorderColumnsSchema } from '@taia/core/validation/schemas'
import { reorderColumns, getColumnsForWorkspace } from '@taia/core/db'

export const POST = withErrorBoundary(async (req: NextRequest, { params }) => {
  const { workspaceId } = await params
  const body = await req.json()
  const { column_ids } = validate(ReorderColumnsSchema, body)
  await reorderColumns(workspaceId, column_ids)
  const columns = await getColumnsForWorkspace(workspaceId)
  return apiOk({ columns })
})
