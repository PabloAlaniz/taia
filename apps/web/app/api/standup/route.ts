import { NextRequest, NextResponse } from 'next/server'
import { generateStandup } from '@taia/core/services/standup.service'
import { apiError } from '@taia/core/errors'
import { requestWorkspaceId } from '@taia/core/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const format = req.nextUrl.searchParams.get('format') || 'text'
    const { standup, stats } = await generateStandup(
      requestWorkspaceId(req, req.nextUrl.searchParams.get('workspace_id')),
    )

    if (format === 'json') {
      return NextResponse.json({
        standup,
        generated: new Date().toISOString(),
        stats,
      })
    }

    return new Response(standup, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    return apiError(error)
  }
}
