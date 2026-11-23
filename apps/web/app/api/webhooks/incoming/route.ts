import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@taia/core/errors'
import {
  handleIncomingWebhook,
  IncomingWebhookError,
} from '@taia/core/services/incoming-webhook.service'
import { clientBucket } from '@/lib/client-bucket'
import { BodyTooLargeError, readBytesWithin } from '@/lib/read-body'
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
    const { searchParams } = request.nextUrl
    const workspaceId =
      searchParams.get('workspace_id') || request.headers.get('x-workspace-id') || ''

    let body: Uint8Array
    try {
      body = await readBytesWithin(request, webhookMaxBytes())
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) throw error
      return NextResponse.json(
        { ok: false, code: 'PAYLOAD_TOO_LARGE', error: error.message },
        { status: 413 },
      )
    }

    const dryRun = searchParams.get('dry_run') === '1' || searchParams.get('dry_run') === 'true'
    const result = await handleIncomingWebhook({
      workspaceId,
      request: { headers: [...request.headers], query: [...searchParams], body },
      dryRun,
    })

    return NextResponse.json(result, { status: result.duplicate ? 200 : 202 })
  } catch (error) {
    if (error instanceof IncomingWebhookError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      )
    }
    return apiError(error)
  }
}
