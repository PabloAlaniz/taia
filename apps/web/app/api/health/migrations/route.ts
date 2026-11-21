import { NextResponse } from 'next/server'
import { pool } from '@taia/core/db'
import { checkMigrationDrift } from '@taia/core/db/migrations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const report = await checkMigrationDrift(pool)
    return NextResponse.json(report, { status: report.status === 'ok' ? 200 : 503 })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'drift',
        message: 'Migration drift diagnostic failed before comparison.',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    )
  }
}
