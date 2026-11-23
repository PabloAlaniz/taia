import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@taia/core/errors'
import {
  listOutgoingWebhookDiagnostics,
  OutgoingWebhookReplayError,
  replayOutgoingWebhookDelivery,
} from '@taia/core/services/outgoing-webhook.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function workspaceIdFromRequest(request: NextRequest): string {
  return (
    request.nextUrl.searchParams.get('workspace_id') ||
    request.headers.get('x-workspace-id') ||
    ''
  ).trim()
}

export async function GET(request: NextRequest) {
  try {
    const workspaceId = workspaceIdFromRequest(request)
    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: 'workspace_id is required' }, { status: 400 })
    }

    const diagnostics = await listOutgoingWebhookDiagnostics(workspaceId)
    return NextResponse.json({ ok: true, workspace_id: workspaceId, ...diagnostics })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const workspaceId = (body.workspace_id || workspaceIdFromRequest(request) || '').trim()
    const deliveryId = (body.delivery_id || body.deliveryId || '').trim()
    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: 'workspace_id is required' }, { status: 400 })
    }
    if (!deliveryId) {
      return NextResponse.json({ ok: false, error: 'delivery_id is required' }, { status: 400 })
    }

    const result = await replayOutgoingWebhookDelivery({ workspaceId, deliveryId })
    return NextResponse.json({ ok: true, workspace_id: workspaceId, ...result })
  } catch (error) {
    if (error instanceof OutgoingWebhookReplayError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status })
    }
    return apiError(error)
  }
}
