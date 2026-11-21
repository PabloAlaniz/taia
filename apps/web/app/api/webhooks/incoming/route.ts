import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@taia/core/errors'
import { handleIncomingWebhook } from '@taia/core/services/incoming-webhook.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const workspaceId =
      request.nextUrl.searchParams.get('workspace_id') ||
      request.headers.get('x-workspace-id') ||
      ''

    const rawBody = await request.text()
    let payload
    try {
      payload = rawBody ? JSON.parse(rawBody) : {}
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid JSON',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      )
    }

    const result = await handleIncomingWebhook({
      workspaceId,
      rawBody,
      payload,
      headers: {
        id: request.headers.get('x-taia-webhook-id') || request.headers.get('x-github-delivery'),
        signature:
          request.headers.get('x-taia-webhook-signature') ||
          request.headers.get('x-hub-signature-256'),
        timestamp: request.headers.get('x-taia-webhook-timestamp'),
        githubEvent: request.headers.get('x-github-event'),
      },
      dryRun:
        request.nextUrl.searchParams.get('dry_run') === '1' ||
        request.nextUrl.searchParams.get('dry_run') === 'true',
    })

    return NextResponse.json(result, { status: result.duplicate ? 200 : 202 })
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string }
    if (typed.status) {
      return NextResponse.json(
        { ok: false, code: typed.code || 'INCOMING_WEBHOOK_ERROR', error: typed.message },
        { status: typed.status },
      )
    }
    return apiError(error)
  }
}
