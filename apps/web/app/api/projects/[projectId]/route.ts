import { NextRequest } from 'next/server'
import {
  getProject,
  updateExistingProject,
  deleteExistingProject,
} from '@taia/core/services/project.service'
import { validate } from '@taia/core/validation/validate'
import { UpdateProjectSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { projectId } = await context.params
  const project = await getProject(projectId)
  if (!project) throw new NotFoundError('Project', projectId)
  return apiOk({ project })
})

export const PUT = withErrorBoundary(async (req: NextRequest, context) => {
  const { projectId } = await context.params
  const body = await req.json()
  const updates = validate(UpdateProjectSchema, body)
  const project = await updateExistingProject(projectId, updates)
  if (!project) throw new NotFoundError('Project', projectId)
  return apiOk({ project })
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { projectId } = await context.params
  const project = await getProject(projectId)
  if (!project) throw new NotFoundError('Project', projectId)
  await deleteExistingProject(projectId)
  return apiOk({})
})

export { PUT as PATCH }
