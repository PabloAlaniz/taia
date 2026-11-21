import { NextRequest } from 'next/server'
import { getTask, assignTaskWithBroadcast } from '@taia/core/services/task.service'
import { getAgentById } from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { AssignTaskSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'
import { broadcastAgentStatus } from '@taia/core/broadcast'

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json()
  const { taskId, agentId } = validate(AssignTaskSchema, body)

  const existing = await getTask(taskId)
  if (!existing) throw new NotFoundError('Task', taskId)

  const agent = await getAgentById(agentId)
  if (!agent) throw new NotFoundError('Agent', agentId)

  const task = await assignTaskWithBroadcast(taskId, agentId, 'web-ui')
  broadcastAgentStatus(agentId, 'assigned', taskId)

  return apiOk({
    task,
    note: 'Task assigned. The orchestrator will spawn the agent on next heartbeat or manual trigger.',
  })
})
