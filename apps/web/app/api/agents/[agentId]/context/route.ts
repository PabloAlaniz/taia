import { NextRequest, NextResponse } from 'next/server'
import { getAgentById, getAgentContext, getAgentIdentityVersion } from '@taia/core/db'
import { updateAgentIdentity } from '@taia/core/services/agent-context.service'
import type { AgentIdentity } from '@taia/types'

/**
 * GET /api/agents/[agentId]/context
 *
 * Returns the active agent identity (the typed bundle layer) plus the
 * version metadata so the UI can display "this is version Y, last edited
 * by Z, on T". 404 if the agent doesn't exist; 200 with `identity: null`
 * when the agent exists but has no agent_context row yet (UI shows the
 * empty-state).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  const agent = await getAgentById(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }

  const ctx = await getAgentContext(agentId)
  if (!ctx?.agent_identity_version_id) {
    return NextResponse.json({
      agentId,
      identity: null,
      versionId: null,
      contextUpdatedAt: ctx?.updated_at ?? null,
    })
  }

  const version = await getAgentIdentityVersion(ctx.agent_identity_version_id)
  if (!version) {
    return NextResponse.json({
      agentId,
      identity: null,
      versionId: ctx.agent_identity_version_id,
      contextUpdatedAt: ctx.updated_at,
    })
  }

  return NextResponse.json({
    agentId,
    identity: version.content,
    versionId: version.id,
    versionCreatedAt: version.created_at,
    versionCreatedBy: version.created_by,
    versionNote: version.note,
    contextUpdatedAt: ctx.updated_at,
  })
}

/**
 * PATCH /api/agents/[agentId]/context
 *
 * Update the typed identity. Body is a partial AgentIdentity merged onto
 * the current active version (so the UI can edit one field at a time).
 * Always creates a new version (append-only) — no destructive update.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  const agent = await getAgentById(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }

  let body: {
    identity?: Partial<AgentIdentity>
    note?: string
    createdBy?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.identity || typeof body.identity !== 'object') {
    return NextResponse.json({ error: 'identity_required' }, { status: 400 })
  }

  // The service merges over the active version so the UI can patch one field.
  const result = await updateAgentIdentity(agentId, body.identity, {
    createdBy: body.createdBy ?? 'ui:context',
    note: body.note,
  })

  return NextResponse.json({
    agentId,
    identity: result.identity,
    versionId: result.versionId,
  })
}
