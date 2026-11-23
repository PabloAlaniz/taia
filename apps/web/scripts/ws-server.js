#!/usr/bin/env node

const { WebSocketServer, WebSocket } = require('ws')
const http = require('http')
const { execSync } = require('child_process')
const { createHmac, timingSafeEqual } = require('crypto')

// Same variables as docker-compose.yml uses for the host ports, so a second
// instance on this machine only needs different values.
const PORT = Number(process.env.WS_PORT) || 13334
const BROADCAST_PORT = Number(process.env.BROADCAST_PORT) || 13335
// Authentication is optional (TAIA_API_TOKEN): listen on this machine only
// unless the operator says otherwise (the Docker image sets 0.0.0.0, and
// compose publishes the ports on 127.0.0.1).
const HOST = process.env.TAIA_BIND_HOST || '127.0.0.1'

/** A positive integer from the environment, or `fallback`. */
function positiveInt(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

// Browsers beyond this many connections are turned away (503): each open
// socket costs memory and a send per broadcast.
const MAX_CLIENTS = positiveInt(process.env.TAIA_WS_MAX_CLIENTS, 200)
// Clients only receive, so a message from one is never larger than a ping.
const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024
// The app's broadcasts are small events; anything bigger is refused (413).
const MAX_BROADCAST_BYTES = positiveInt(process.env.TAIA_WS_MAX_BROADCAST_BYTES, 1024 * 1024)

// Optional access token (see packages/core/src/auth.ts, which this mirrors:
// this script runs on plain Node, outside the app). With it set, browsers
// connect with the ticket /api/config/client hands them and the app posts
// broadcasts with the token itself.
const TOKEN = (process.env.TAIA_API_TOKEN || '').trim()
if (TOKEN && TOKEN.length < 16) {
  console.error('[WS] TAIA_API_TOKEN must have at least 16 characters')
  process.exit(1)
}
const WS_TICKET = TOKEN ? createHmac('sha256', TOKEN).update('taia-ws-v1').digest('hex') : null

function sameString(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Whether a browser may open a WebSocket: always without a token, else with the ticket. */
function clientAllowed(req) {
  if (!WS_TICKET) return true
  const ticket = new URL(req.url || '/', 'http://localhost').searchParams.get('ticket')
  return !!ticket && sameString(ticket, WS_TICKET)
}

/** Whether a broadcast may be relayed: always without a token, else with it as bearer. */
function broadcastAllowed(req) {
  if (!TOKEN) return true
  // `\S` after `\s+`: one place to split, so no backtracking on long runs of spaces.
  const bearer = /^Bearer\s+(\S.*)$/i.exec(req.headers.authorization || '')
  return !!bearer && sameString(bearer[1].trim(), TOKEN)
}

function getPortInfo(port) {
  try {
    const output = execSync(`lsof -i :${port} -P -n | grep LISTEN`, { encoding: 'utf8' }).trim()
    if (output) {
      const lines = output.split('\n').map((line) => {
        const parts = line.split(/\s+/)
        return `  → PID ${parts[1]} (${parts[0]})`
      })
      return lines.join('\n')
    }
  } catch {
    // lsof not available or no results
  }
  return null
}

function handlePortError(err, port, serverName) {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n${'═'.repeat(60)}`)
    console.error(`❌ ERROR: Puerto ${port} ya está en uso (${serverName})`)
    console.error(`${'═'.repeat(60)}`)
    const info = getPortInfo(port)
    if (info) {
      console.error(`\nProceso(s) ocupando el puerto:`)
      console.error(info)
    }
    console.error(`\nPara liberarlo:`)
    console.error(`  kill $(lsof -ti :${port})        # Terminar proceso`)
    console.error(`  kill -9 $(lsof -ti :${port})     # Forzar terminación`)
    console.error(`${'═'.repeat(60)}\n`)
    process.exit(1)
  }
  throw err
}

async function preflight() {
  try {
    const res = await fetch(`http://localhost:${BROADCAST_PORT}/`, {
      signal: AbortSignal.timeout(1500),
    })
    const body = await res.json()
    if (body.service === 'taia-ws-server') {
      console.log('[WS] TAIA ws-server already running — reusing existing instance.')
      process.exit(0)
    }
  } catch {
    // Connection refused or timeout = port is free, proceed normally
  }
}

async function main() {
  await preflight()

  const clients = new Set()

  const wss = new WebSocketServer({
    host: HOST,
    port: PORT,
    maxPayload: MAX_CLIENT_MESSAGE_BYTES,
    verifyClient: ({ req }, done) => {
      if (!clientAllowed(req)) return done(false, 401, 'Unauthorized')
      if (clients.size >= MAX_CLIENTS) {
        console.warn(`[WS] Refused a client: already ${clients.size} (TAIA_WS_MAX_CLIENTS)`)
        return done(false, 503, 'Too many connections')
      }
      return done(true)
    },
  })

  wss.on('error', (err) => handlePortError(err, PORT, 'WebSocket server'))

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[WS] Client connected (${clients.size} total)`)

    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: { message: 'TAIA WebSocket connected' },
        timestamp: Date.now(),
      }),
    )

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[WS] Client disconnected (${clients.size} total)`)
    })

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message)
      clients.delete(ws)
    })

    // Clients only receive. Broadcasts come from the server through the
    // internal HTTP endpoint below; relaying client messages to every other
    // client would let any visitor push fake events (auth is optional).
  })

  // HTTP endpoint for API to trigger broadcasts
  const broadcastServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/broadcast') {
      if (!broadcastAllowed(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
      let body = ''
      let size = 0
      let refused = false
      req.on('data', (chunk) => {
        if (refused) return
        size += chunk.length
        if (size > MAX_BROADCAST_BYTES) {
          refused = true
          res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' })
          res.end(JSON.stringify({ error: 'Broadcast too large' }))
          req.destroy()
          return
        }
        body += chunk
      })
      req.on('end', () => {
        if (refused) return
        try {
          const message = JSON.parse(body)
          const data = JSON.stringify(message)
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data)
            }
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, clients: clients.size }))
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ service: 'taia-ws-server', status: 'ok', clients: clients.size }))
    }
  })

  broadcastServer.on('error', (err) =>
    handlePortError(err, BROADCAST_PORT, 'Broadcast HTTP server'),
  )

  broadcastServer.listen(BROADCAST_PORT, HOST, () => {
    console.log(`[WS] Broadcast HTTP on http://${HOST}:${BROADCAST_PORT}`)
  })

  console.log(`[WS] WebSocket server on ws://${HOST}:${PORT}`)
}

main().catch((err) => {
  console.error('[WS] Fatal error:', err)
  process.exit(1)
})
