import { NextRequest, NextResponse } from 'next/server'
import { listAgentMemories } from '@taia/core/db'

const MEMORY_PREFIX = '/memories/'

/**
 * GET /api/agents/[agentId]/memory
 *
 * Names of the agent's memory files (agent_memory under /memories/), as the
 * per-file route expects them.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const memories = await listAgentMemories(agentId, { pathPrefix: MEMORY_PREFIX })
  return NextResponse.json({
    agentId,
    files: memories.map((m) => m.path.slice(MEMORY_PREFIX.length)),
  })
}
