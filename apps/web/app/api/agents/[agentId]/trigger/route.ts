import { NextRequest, NextResponse } from 'next/server'
import { triggerAgentHeartbeat } from '@taia/core/services/trigger.service'
import { apiError } from '@taia/core/errors'

/** `?force=1` starts a run even if the agent has one running. */
const forced = (request: NextRequest) =>
  ['1', 'true'].includes(request.nextUrl.searchParams.get('force') ?? '')

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params
    const result = await triggerAgentHeartbeat(agentId, { force: forced(request) })

    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.error?.includes('No heartbeat') ? 404 : 500,
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}
