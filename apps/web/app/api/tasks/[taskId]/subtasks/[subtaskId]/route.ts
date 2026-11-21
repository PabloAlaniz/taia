import { getTaskById, getSubtaskById, updateSubtask, deleteSubtask } from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { UpdateSubtaskSchema } from '@taia/core/validation/schemas'
import { apiOk, apiError, NotFoundError } from '@taia/core/errors'
import { logSubtaskCompleted, logSubtaskDeleted } from '@taia/core/services/activity.service'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ taskId: string; subtaskId: string }> },
) {
  try {
    const { taskId, subtaskId } = await params
    const body = await request.json()
    const data = validate(UpdateSubtaskSchema, body)

    // Get before state for activity logging
    const before = await getSubtaskById(subtaskId)
    if (!before) throw new NotFoundError('Subtask', subtaskId)

    const subtask = await updateSubtask(subtaskId, data)
    if (!subtask) throw new NotFoundError('Subtask', subtaskId)

    // Log completion changes
    if (data.completed !== undefined && data.completed !== before.completed) {
      const task = await getTaskById(taskId)
      await logSubtaskCompleted(subtask, task?.title || 'Unknown', data.completed)
    }

    return apiOk({ subtask })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ taskId: string; subtaskId: string }> },
) {
  try {
    const { taskId, subtaskId } = await params
    // Get subtask and task info before deletion
    const subtask = await getSubtaskById(subtaskId)
    if (!subtask) throw new NotFoundError('Subtask', subtaskId)

    const task = await getTaskById(taskId)

    const deleted = await deleteSubtask(subtaskId)
    if (!deleted) throw new NotFoundError('Subtask', subtaskId)

    // Log activity
    await logSubtaskDeleted(taskId, subtask.title, task?.title || 'Unknown')

    return apiOk({})
  } catch (error) {
    return apiError(error)
  }
}
