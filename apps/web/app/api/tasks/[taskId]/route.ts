import { NextRequest } from 'next/server'
import {
  getTask,
  updateTaskWithBroadcast,
  deleteTaskWithBroadcast,
} from '@taia/core/services/task.service'
import { validate } from '@taia/core/validation/validate'
import { UpdateTaskSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { taskId } = await context.params
  const task = await getTask(taskId)
  if (!task) throw new NotFoundError('Task', taskId)
  return apiOk({ task })
})

export const PUT = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const body = await req.json()
  const updates = validate(UpdateTaskSchema, body)
  const task = await updateTaskWithBroadcast(taskId, updates, 'web-ui')
  if (!task) throw new NotFoundError('Task', taskId)
  return apiOk({ task })
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { taskId } = await context.params
  const task = await getTask(taskId)
  if (!task) throw new NotFoundError('Task', taskId)
  await deleteTaskWithBroadcast(taskId, 'web-ui')
  return apiOk({})
})

export { PUT as PATCH }
