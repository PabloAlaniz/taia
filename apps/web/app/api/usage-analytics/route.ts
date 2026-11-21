import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@taia/core/errors'
import { getUsageAnalytics, usageAnalyticsToCsv } from '@taia/core/services/usage-analytics.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/usage-analytics?workspace_id=...&start=...&end=...&format=json|csv
 *
 * Returns automation-friendly usage metrics for a workspace/date range:
 * throughput, active-task aging, and tracked time grouped by board column.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json'

    if (format !== 'json' && format !== 'csv') {
      return NextResponse.json({ error: 'format must be json or csv' }, { status: 400 })
    }

    const metrics = await getUsageAnalytics({
      workspace_id: searchParams.get('workspace_id') || undefined,
      start: searchParams.get('start') || undefined,
      end: searchParams.get('end') || undefined,
      evaluate_sla: searchParams.get('sla') === 'true',
      persist_alerts: searchParams.get('persist_alerts') === 'true',
    })

    if (format === 'csv') {
      return new NextResponse(usageAnalyticsToCsv(metrics), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="usage-analytics.csv"',
        },
      })
    }

    return NextResponse.json({ ok: true, metrics })
  } catch (error) {
    return apiError(error)
  }
}
