import { NextRequest, NextResponse } from 'next/server'
import { triggerAgentHeartbeat } from '@taia/core/services/trigger.service'
import { apiError } from '@taia/core/errors'

/** `?force=1` starts a run even if the agent has one running. */
const forced = (request: NextRequest) =>
  ['1', 'true'].includes(request.nextUrl.searchParams.get('force') ?? '')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const shouldRun = request.nextUrl.searchParams.get('run') === 'true'

  if (!shouldRun) {
    return NextResponse.json({
      endpoint: 'trigger',
      agentId,
      usage: 'GET /api/trigger/{agentId}?run=true[&force=1]',
    })
  }

  try {
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
