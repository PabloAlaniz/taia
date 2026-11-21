import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { eventBus, initEventListeners } from '@taia/core/events'

export const dynamic = 'force-dynamic'

export const GET = withErrorBoundary(async (request: NextRequest) => {
  initEventListeners()

  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspace_id') || undefined
  const health = eventBus.getHealth()

  return apiOk({
    ...health,
    workspace_id: workspaceId,
    listeners: health.listeners.map((listener) => ({
      ...listener,
      workspaceMatched:
        workspaceId === undefined ||
        listener.lastWorkspaceId === undefined ||
        listener.lastWorkspaceId === workspaceId,
    })),
  })
})
