import { NextRequest, NextResponse } from 'next/server'
import { listApprovalRequests, type ApprovalStatus } from '@taia/core/db'
import { apiError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/approvals — list approval requests for the active runtime.
 * Filters: ?status=pending|approved|rejected|timed_out, ?agent_id=…,
 * ?session_key=…, ?limit=…
 *
 * Used by the dashboard to render pending approvals and by automation to
 * poll for new requests.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const status = params.get('status') as ApprovalStatus | null
    const agentId = params.get('agent_id')
    const sessionKey = params.get('session_key')
    const limitRaw = params.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const rows = await listApprovalRequests({
      status: status || undefined,
      agentId: agentId || undefined,
      sessionKey: sessionKey || undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    return NextResponse.json({ ok: true, approvals: rows })
  } catch (error) {
    return apiError(error)
  }
}
