import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@taia/core/errors'
import { handleIncomingWebhook } from '@taia/core/services/incoming-webhook.service'
import { clientBucket } from '@/lib/client-bucket'
import { BodyTooLargeError, readTextWithin } from '@/lib/read-body'
import { checkWebhookLimit, webhookMaxBytes } from '@/lib/webhook-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // Before the body or the database: see lib/webhook-limit.
  const limited = await checkWebhookLimit(clientBucket(request.headers))
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', error: 'Too many webhook deliveries, try again later' },
      { status: limited.status ?? 429, headers: limited.headers },
    )
  }

  try {
    const workspaceId =
      request.nextUrl.searchParams.get('workspace_id') ||
      request.headers.get('x-workspace-id') ||
      ''

    let rawBody: string
    try {
      rawBody = await readTextWithin(request, webhookMaxBytes())
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) throw error
      return NextResponse.json(
        { ok: false, code: 'PAYLOAD_TOO_LARGE', error: error.message },
        { status: 413 },
      )
    }
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
