import { NextRequest, NextResponse } from 'next/server'
import { triggerAgentHeartbeat, type TriggerResult } from '@taia/core/services/trigger.service'
import { apiError } from '@taia/core/errors'

/** A refused trigger: 429 for a spent rate limit, 404 for an unknown heartbeat, else 500. */
function failed(result: TriggerResult) {
  if (result.retryAfterSeconds !== undefined) {
    return NextResponse.json(result, {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    })
  }
  return NextResponse.json(result, { status: result.error?.includes('No heartbeat') ? 404 : 500 })
}

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

    if (!result.ok) return failed(result)

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

    if (!result.ok) return failed(result)

    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}
