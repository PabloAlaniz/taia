import { NextRequest, NextResponse } from 'next/server'
import { decideApproval, getApprovalRequest } from '@taia/core/db'
import { apiError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/approvals/:id/decide
 * Body: { decision: 'approved' | 'rejected', reason?: string, decided_by?: string }
 *
 * Transitions a pending approval to approved or rejected. Returns 404 if
 * the row doesn't exist, 409 if it's already decided.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const decision = body.decision as 'approved' | 'rejected' | undefined

    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json(
        { ok: false, error: 'decision must be "approved" or "rejected"' },
        { status: 400 },
      )
    }

    const existing = await getApprovalRequest(id)
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }
    if (existing.status !== 'pending') {
      return NextResponse.json(
        {
          ok: false,
          error: 'already_decided',
          status: existing.status,
        },
        { status: 409 },
      )
    }

    const updated = await decideApproval(id, {
      status: decision,
      reason: body.reason,
      decidedBy: body.decided_by,
    })
    return NextResponse.json({ ok: true, approval: updated })
  } catch (error) {
    return apiError(error)
  }
}
