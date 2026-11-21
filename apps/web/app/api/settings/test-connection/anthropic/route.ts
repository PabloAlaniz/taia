import { NextRequest } from 'next/server'
import { handleTestConnection } from '@/lib/test-connection'

// POST /api/settings/test-connection/anthropic
// Kept for existing clients; equivalent to the generic route with
// `provider: 'anthropic'`. Body: { apiKey?: string, model?: string }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleTestConnection(body, 'anthropic')
}
