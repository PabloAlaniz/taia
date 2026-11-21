import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { getWorktreeDiff } from '@taia/core/services/worktree.service'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { worktreeId } = await context.params
  const diff = await getWorktreeDiff(worktreeId)
  return apiOk({ diff })
})
