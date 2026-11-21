import { NextResponse } from 'next/server'
import { getSetting } from '@taia/core/db'
import { config } from '@taia/core/config'
import { apiToken, webSocketTicket } from '@taia/core/auth'

export const dynamic = 'force-dynamic'

// GET /api/config/client — lightweight client-facing config from DB settings.
// Fallback order: DB setting -> WS_CLIENT_URL env (config.ws.clientUrl) -> ws://localhost:13334.
// This lets a deployment behind a reverse proxy expose the WS via WS_CLIENT_URL (e.g. wss://domain/ws)
// without anyone having to set it manually in the UI.
export async function GET() {
  let wsUrl = (await getSetting('app.ws_url')) || config.ws.clientUrl
  // With an access token configured, the WebSocket server only accepts
  // connections that carry the ticket derived from it. This route is behind
  // the same token, so only an authenticated browser gets one.
  const token = apiToken()
  if (token) {
    wsUrl += `${wsUrl.includes('?') ? '&' : '?'}ticket=${await webSocketTicket(token)}`
  }
  const defaultTz = (await getSetting('app.default_tz')) || 'UTC'

  return NextResponse.json({ ok: true, wsUrl, defaultTz })
}
