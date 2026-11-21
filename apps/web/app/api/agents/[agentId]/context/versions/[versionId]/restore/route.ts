import { NextRequest, NextResponse } from 'next/server'
import { getAgentById } from '@taia/core/db'
import { NotFoundError } from '@taia/core/errors'
import { restoreAgentIdentity } from '@taia/core/services/agent-context.service'

/**
 * POST /api/agents/[agentId]/context/versions/[versionId]/restore
 *
 * Restore a prior identity version by saving its content as a new active
 * version (append-only — the original row is never deleted). Runtimes are
 * re-synced by the `agent-context:changed` event the service emits.
 *
 * Body (optional): { createdBy, note }. Defaults: 'ui:restore' / 'Restored
 * from <vid>'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; versionId: string }> },
) {
  const { agentId, versionId } = await params

  const agent = await getAgentById(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }

  let body: { createdBy?: string; note?: string } = {}
  try {
    body = (await request.json()) as { createdBy?: string; note?: string }
  } catch {
    // Empty body is fine.
  }

  try {
    const result = await restoreAgentIdentity(agentId, versionId, {
      createdBy: body.createdBy ?? 'ui:restore',
      ...(body.note ? { note: body.note } : {}),
    })
    return NextResponse.json({
      agentId,
      restoredFrom: versionId,
      versionId: result.versionId,
      identity: result.identity,
    })
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: 'version_not_found' }, { status: 404 })
    }
    throw err
  }
}
