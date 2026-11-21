import {
  getProject,
  listRepositories,
  createNewRepository,
} from '@taia/core/services/project.service'
import { validate } from '@taia/core/validation/validate'
import { CreateRepositorySchema } from '@taia/core/validation/schemas'
import { apiOk, apiError, NotFoundError } from '@taia/core/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params
    const project = await getProject(projectId)
    if (!project) throw new NotFoundError('Project', projectId)
    const repositories = await listRepositories(projectId)
    return apiOk({ repositories })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params
    const project = await getProject(projectId)
    if (!project) throw new NotFoundError('Project', projectId)
    const body = await request.json()
    const data = validate(CreateRepositorySchema, body)
    const repository = await createNewRepository({
      project_id: projectId,
      ...data,
    })
    return apiOk({ repository }, 201)
  } catch (error) {
    return apiError(error)
  }
}
