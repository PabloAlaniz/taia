import { NextRequest, NextResponse } from 'next/server'
import { getAgentById, getAgentWorkingState, upsertAgentWorkingState } from '@taia/core/db'

/**
 * GET /api/agents/[agentId]/working-state
 *
 * The agent's progress notes between runs (formerly WORKING.md). Returns
 * empty content when the agent has none yet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  if (!(await getAgentById(agentId))) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }
  const state = await getAgentWorkingState(agentId)
  return NextResponse.json({
    agentId,
    content: state?.content ?? '',
    taskId: state?.task_id ?? null,
    updatedBy: state?.updated_by ?? null,
    updatedAt: state?.updated_at ?? null,
  })
}

/**
 * PUT /api/agents/[agentId]/working-state
 * Body: { content: string, taskId?: string | null, updatedBy?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  if (!(await getAgentById(agentId))) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 })
  }

  let body: { content?: unknown; taskId?: unknown; updatedBy?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content_required' }, { status: 400 })
  }

  const state = await upsertAgentWorkingState(agentId, body.content, {
    taskId: typeof body.taskId === 'string' ? body.taskId : null,
    updatedBy: typeof body.updatedBy === 'string' ? body.updatedBy : 'api',
  })
  return NextResponse.json({
    agentId,
    content: state.content,
    taskId: state.task_id,
    updatedBy: state.updated_by,
    updatedAt: state.updated_at,
  })
}
