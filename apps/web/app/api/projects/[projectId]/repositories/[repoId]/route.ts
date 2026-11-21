import {
  getRepo,
  updateExistingRepository,
  deleteExistingRepository,
} from '@taia/core/services/project.service'
import { validate } from '@taia/core/validation/validate'
import { UpdateRepositorySchema } from '@taia/core/validation/schemas'
import { apiOk, apiError, NotFoundError } from '@taia/core/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  try {
    const { projectId, repoId } = await params
    const repository = await getRepo(repoId)
    if (!repository || repository.project_id !== projectId) {
      throw new NotFoundError('Repository', repoId)
    }
    return apiOk({ repository })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  try {
    const { projectId, repoId } = await params
    const existing = await getRepo(repoId)
    if (!existing || existing.project_id !== projectId) {
      throw new NotFoundError('Repository', repoId)
    }
    const body = await request.json()
    const updates = validate(UpdateRepositorySchema, body)
    const repository = await updateExistingRepository(repoId, updates)
    if (!repository) throw new NotFoundError('Repository', repoId)
    return apiOk({ repository })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  try {
    const { projectId, repoId } = await params
    const existing = await getRepo(repoId)
    if (!existing || existing.project_id !== projectId) {
      throw new NotFoundError('Repository', repoId)
    }
    await deleteExistingRepository(repoId)
    return apiOk({})
  } catch (error) {
    return apiError(error)
  }
}

export { PUT as PATCH }
