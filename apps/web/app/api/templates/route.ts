import { NextRequest } from 'next/server'
import { getAllTemplates, createTemplate } from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { CreateTemplateSchema } from '@taia/core/validation/schemas'
import { apiOk } from '@taia/core/errors'
import { requestWorkspaceId, withErrorBoundary } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const templates = await getAllTemplates(
    requestWorkspaceId(req, req.nextUrl.searchParams.get('workspace_id')),
  )
  return apiOk({ templates })
})

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()
  const data = validate(CreateTemplateSchema, body)
  const template = await createTemplate({
    ...data,
    workspace_id: requestWorkspaceId(req, body?.workspace_id),
  })
  return apiOk({ template }, 201)
})
