import { NextRequest } from 'next/server'
import { validate } from '@taia/core/validation/validate'
import { CreateSavedFilterSchema } from '@taia/core/validation/schemas'
import { apiOk } from '@taia/core/errors'
import { getAllSavedFilters, createSavedFilter } from '@taia/core/db'
import { requestWorkspaceId, withErrorBoundary } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const filters = await getAllSavedFilters(
    requestWorkspaceId(req, req.nextUrl.searchParams.get('workspace_id')),
  )
  return apiOk({ filters })
})

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()
  const data = validate(CreateSavedFilterSchema, body)
  const filter = await createSavedFilter({
    ...data,
    workspace_id: requestWorkspaceId(req, body?.workspace_id),
  })
  return apiOk({ filter }, 201)
})
