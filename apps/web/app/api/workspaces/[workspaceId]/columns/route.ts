export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { CreateBoardColumnSchema } from '@taia/core/validation/schemas'
import { getColumnsForWorkspace, createColumn } from '@taia/core/db'

export const GET = withErrorBoundary(async (_req, { params }) => {
  const { workspaceId } = await params
  const columns = await getColumnsForWorkspace(workspaceId)
  return apiOk({ columns })
})

export const POST = withErrorBoundary(async (req: NextRequest, { params }) => {
  const { workspaceId } = await params
  const body = await req.json()
  const data = validate(CreateBoardColumnSchema, body)
  const column = await createColumn(workspaceId, data)
  return apiOk({ column })
})
