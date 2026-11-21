import { NextRequest, NextResponse } from 'next/server'
import { fetchEnrichedAgents, createAgent } from '@taia/core/services/agent.service'
import { validate } from '@taia/core/validation/validate'
import { CreateAgentSchema } from '@taia/core/validation/schemas'
import { apiOk, apiError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fullDetail = searchParams.get('detail') === 'full'

  try {
    const { agents, source } = await fetchEnrichedAgents(fullDetail)
    return NextResponse.json({ ok: true, agents, source })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        ok: false,
        error: message,
        agents: [],
        source: 'error',
      },
      { status: 503 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = validate(CreateAgentSchema, body)
    const { agent, runtimeProvisioning } = await createAgent(data)
    return apiOk({ agent, runtimeProvisioning })
  } catch (error) {
    return apiError(error)
  }
}
