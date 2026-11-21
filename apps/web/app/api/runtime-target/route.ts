import { type NextRequest, NextResponse } from 'next/server'
import { getRuntimeTargetDiagnostic } from '@taia/core/diagnostics/runtime-target'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspace_id') || 'ws-default'
    const diagnostic = await getRuntimeTargetDiagnostic('web-api', workspaceId)
    return NextResponse.json({ ok: true, diagnostic })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown runtime-target diagnostic error',
      },
      { status: 503 },
    )
  }
}
