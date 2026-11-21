import { NextRequest } from 'next/server'
import { listProjects, createNewProject } from '@taia/core/services/project.service'
import { validate } from '@taia/core/validation/validate'
import { CreateProjectSchema } from '@taia/core/validation/schemas'
import { apiOk } from '@taia/core/errors'
import { requestWorkspaceId, withErrorBoundary } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const projects = await listProjects(
    requestWorkspaceId(req, req.nextUrl.searchParams.get('workspace_id')),
  )
  return apiOk({ projects })
})

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()
  const data = validate(CreateProjectSchema, body)
  const project = await createNewProject({
    ...data,
    workspace_id: requestWorkspaceId(req, body?.workspace_id),
  })
  return apiOk({ project }, 201)
})
