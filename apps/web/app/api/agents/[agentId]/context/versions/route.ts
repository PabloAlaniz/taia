import { NextRequest, NextResponse } from 'next/server'
import { getAgentById, listAgentIdentityVersions } from '@taia/core/db'

/**
 * GET /api/agents/[agentId]/context/versions
 *
 * Returns the agent's identity history, newest first. Each entry includes
 * the full content (the UI can preview / diff). Default limit 50; raise
 * via `?limit=N` (max 200).
 *
 * 404 when the agent doesn't exist; 200 with empty list when the agent has
 * no versions yet (agents created before context versioning, before backfill).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  const agent = await getAgentById(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50

  const rows = await listAgentIdentityVersions(agentId, limit)

  return NextResponse.json({
    agentId,
    versions: rows.map((r) => ({
      versionId: r.id,
      content: r.content,
      createdAt: r.created_at,
      createdBy: r.created_by,
      note: r.note,
    })),
  })
}
