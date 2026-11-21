import { NextRequest, NextResponse } from 'next/server'
import {
  getAgentContextSyncStatus,
  syncAgentContext,
} from '@taia/core/services/context-sync.service'

/** Last sync of the agent's context to its runtime (null if never synced). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const row = await getAgentContextSyncStatus(agentId)
  return NextResponse.json({ agentId, sync: row })
}

/**
 * Push the agent's context to its runtime now. `{ "force": true }`
 * overwrites files the agent edited in its workspace.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const body = await request.json().catch(() => ({}))
  try {
    const outcome = await syncAgentContext(agentId, { force: body?.force === true })
    if (!outcome) {
      return NextResponse.json({
        agentId,
        status: 'not_applicable',
        reason: 'The runtime does not keep agent context as files, or the agent has no identity.',
      })
    }
    return NextResponse.json(
      { agentId, ...outcome },
      { status: outcome.status === 'conflict' ? 409 : 200 },
    )
  } catch (err) {
    return NextResponse.json(
      { error: 'Context sync failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
