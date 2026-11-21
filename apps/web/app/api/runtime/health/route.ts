import { NextResponse } from 'next/server'
import { getRuntimeHealth } from '@taia/core/services/runtime-health.service'

export const dynamic = 'force-dynamic'

// GET /api/runtime/health — connection state of every runtime instance and
// their aggregate. `configured: false` means standalone mode (no runtime to
// connect to).
export async function GET() {
  return NextResponse.json(await getRuntimeHealth())
}
