import { NextResponse } from 'next/server'
import { pool } from '@taia/core/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()

  try {
    // Check database connection
    await pool.query('SELECT 1')
    const dbLatency = Date.now() - start

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: {
        connected: true,
        latency_ms: dbLatency,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        db: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 503 },
    )
  }
}
