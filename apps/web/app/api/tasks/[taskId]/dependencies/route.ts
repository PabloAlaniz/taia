import { NextRequest } from 'next/server'
import { validate } from '@taia/core/validation/validate'
import { AddDependencySchema } from '@taia/core/validation/schemas'
import { apiOk, ValidationError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import {
  getDependencies,
  addTaskDependency,
  removeTaskDependency,
} from '@taia/core/services/dependency.service'

/** GET /api/tasks/:taskId/dependencies — list blockers + dependents */
export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { taskId } = await context.params
  const { blockers, dependents } = await getDependencies(taskId)
  return apiOk({ blockers, dependents })
})

/** POST /api/tasks/:taskId/dependencies — add a dependency */
export const POST = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const body = await req.json()
  const { depends_on_task_id } = validate(AddDependencySchema, body)
  const dependency = await addTaskDependency(taskId, depends_on_task_id, 'web-ui')
  return apiOk({ dependency }, 201)
})

/** DELETE /api/tasks/:taskId/dependencies — remove a dependency */
export const DELETE = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const { depends_on_task_id } = await req.json()
  if (!depends_on_task_id) {
    throw new ValidationError('depends_on_task_id is required')
  }
  await removeTaskDependency(taskId, depends_on_task_id, 'web-ui')
  return apiOk({ removed: true })
})
