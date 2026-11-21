export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { NotFoundError } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { UpdateWorkspaceSchema } from '@taia/core/validation/schemas'
import {
  getWorkspace,
  updateExistingWorkspace,
  deleteExistingWorkspace,
} from '@taia/core/services/workspace.service'

export const GET = withErrorBoundary(async (_req, { params }) => {
  const { workspaceId } = await params
  const workspace = await getWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace', workspaceId)
  return apiOk({ workspace })
})

export const PUT = withErrorBoundary(async (req: NextRequest, { params }) => {
  const { workspaceId } = await params
  const body = await req.json()
  const data = validate(UpdateWorkspaceSchema, body)
  const workspace = await updateExistingWorkspace(workspaceId, data)
  if (!workspace) throw new NotFoundError('Workspace', workspaceId)
  return apiOk({ workspace })
})

export const DELETE = withErrorBoundary(async (_req, { params }) => {
  const { workspaceId } = await params
  const deleted = await deleteExistingWorkspace(workspaceId)
  if (!deleted) throw new NotFoundError('Workspace', workspaceId)
  return apiOk({ deleted: true })
})
