import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask } from '@taia/core/db'
import { logTaskTagged, logTaskUntagged } from '@taia/core/services/activity.service'

/**
 * Tags API
 *
 * Add or remove tags from tasks for better organization and filtering.
 * Tags are stored as an array of strings.
 */

/**
 * POST /api/tasks/[taskId]/tags
 *
 * Adds a tag to a task. Idempotent - adding an existing tag returns success.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params
    const { tag } = await request.json()

    if (!tag || typeof tag !== 'string') {
      return NextResponse.json({ ok: false, error: 'Tag is required' }, { status: 400 })
    }

    const task = await getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 })
    }

    const currentTags = task.tags || []
    if (currentTags.includes(tag)) {
      return NextResponse.json({ ok: true, task, message: 'Tag already exists' })
    }

    const updated = await updateTask(taskId, { tags: [...currentTags, tag] })

    // Log activity
    if (updated) {
      await logTaskTagged(updated, tag, 'web-ui')
    }

    return NextResponse.json({ ok: true, task: updated })
  } catch (error) {
    console.error('Error adding tag:', error)
    return NextResponse.json({ ok: false, error: 'Failed to add tag' }, { status: 500 })
  }
}

/**
 * DELETE /api/tasks/[taskId]/tags
 *
 * Removes a tag from a task. Idempotent - removing a non-existent tag returns success.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params
    const { tag } = await request.json()

    if (!tag || typeof tag !== 'string') {
      return NextResponse.json({ ok: false, error: 'Tag is required' }, { status: 400 })
    }

    const task = await getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 })
    }

    const currentTags = task.tags || []
    if (!currentTags.includes(tag)) {
      return NextResponse.json({ ok: true, task, message: 'Tag not present' })
    }

    const updated = await updateTask(taskId, { tags: currentTags.filter((t) => t !== tag) })

    // Log activity
    if (updated) {
      await logTaskUntagged(updated, tag, 'web-ui')
    }

    return NextResponse.json({ ok: true, task: updated })
  } catch (error) {
    console.error('Error removing tag:', error)
    return NextResponse.json({ ok: false, error: 'Failed to remove tag' }, { status: 500 })
  }
}
