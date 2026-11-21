import { NextRequest } from 'next/server'
import { validate } from '@taia/core/validation/validate'
import { CreateWorktreeSchema } from '@taia/core/validation/schemas'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { createWorktree, getWorktreesForTask } from '@taia/core/services/worktree.service'
import { getAllActiveWorktrees } from '@taia/core/db'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const taskId = req.nextUrl.searchParams.get('task_id')

  if (taskId) {
    const worktrees = await getWorktreesForTask(taskId)
    return apiOk({ worktrees })
  }

  const worktrees = await getAllActiveWorktrees()
  return apiOk({ worktrees })
})

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()
  const data = validate(CreateWorktreeSchema, body)
  const worktree = await createWorktree(data)
  return apiOk({ worktree }, 201)
})
