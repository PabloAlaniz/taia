import { NextRequest } from 'next/server'
import { handleTestConnection, type TestConnectionBody } from '@/lib/test-connection'

/**
 * POST /api/settings/test-connection
 * Body: { provider?, url?, token?, apiKey?, model?, command?, cwd? }
 * `provider` defaults to the active one; omitted or masked fields fall back
 * to the stored settings.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as TestConnectionBody
  return handleTestConnection(body)
}
