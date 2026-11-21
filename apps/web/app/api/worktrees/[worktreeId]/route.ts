import { NextRequest } from 'next/server'
import { validate } from '@taia/core/validation/validate'
import { WorktreeActionSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import {
  getWorktreeById,
  startReview,
  mergeWorktree,
  abortWorktree,
  cleanupWorktree,
} from '@taia/core/services/worktree.service'
import { deleteWorktreeRecord } from '@taia/core/db'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { worktreeId } = await context.params
  const worktree = await getWorktreeById(worktreeId)
  if (!worktree) throw new NotFoundError('Worktree', worktreeId)
  return apiOk({ worktree })
})

export const POST = withErrorBoundary(async (req: NextRequest, context) => {
  const { worktreeId } = await context.params
  const body = await req.json()
  const { action, strategy } = validate(WorktreeActionSchema, body)

  let worktree
  switch (action) {
    case 'review':
      worktree = await startReview(worktreeId)
      break
    case 'merge':
      worktree = await mergeWorktree(worktreeId, { strategy })
      break
    case 'abort':
      worktree = await abortWorktree(worktreeId)
      break
    case 'cleanup':
      await cleanupWorktree(worktreeId)
      worktree = await getWorktreeById(worktreeId)
      break
  }

  return apiOk({ worktree })
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { worktreeId } = await context.params
  const deleted = await deleteWorktreeRecord(worktreeId)
  if (!deleted) throw new NotFoundError('Worktree', worktreeId)
  return apiOk({ deleted: true })
})
