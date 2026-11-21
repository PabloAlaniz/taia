import { getTaskById, getSubtasksForTask, createSubtask, reorderSubtasks } from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { CreateSubtaskSchema, ReorderSubtasksSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { logSubtaskCreated } from '@taia/core/services/activity.service'
import { NextRequest } from 'next/server'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { taskId } = await context.params
  const task = await getTaskById(taskId)
  if (!task) throw new NotFoundError('Task', taskId)

  const subtasks = await getSubtasksForTask(taskId)
  return apiOk({ subtasks })
})

export const POST = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const task = await getTaskById(taskId)
  if (!task) throw new NotFoundError('Task', taskId)

  const body = await req.json()
  const data = validate(CreateSubtaskSchema, body)

  const subtask = await createSubtask({
    task_id: taskId,
    title: data.title.trim(),
  })

  // Log activity
  await logSubtaskCreated(subtask, task.title)

  return apiOk({ subtask })
})

export const PUT = withErrorBoundary(async (req: NextRequest, context) => {
  const { taskId } = await context.params
  const task = await getTaskById(taskId)
  if (!task) throw new NotFoundError('Task', taskId)

  const body = await req.json()
  const data = validate(ReorderSubtasksSchema, body)

  await reorderSubtasks(taskId, data.order)
  const subtasks = await getSubtasksForTask(taskId)

  return apiOk({ subtasks })
})
