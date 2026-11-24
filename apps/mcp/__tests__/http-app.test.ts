import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import http from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const verify = vi.fn()
vi.mock('@taia/core/services/access-token.service', () => ({
  verifyAccessToken: (...args: unknown[]) => verify(...args),
}))

const { allowedHosts, createHttpApp } = await import('../src/http-app')

// Starts the real Express app on a free port and talks to it over HTTP.

let server: Server
let port: number

beforeAll(async () => {
  // The port isn't known until the server listens; allow it afterwards.
  const hosts: string[] = []
  server = createHttpApp(hosts).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  port = (server.address() as AddressInfo).port
  hosts.push(...allowedHosts(port))
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  },
}

/** POST /mcp with an explicit Host header (fetch doesn't let you set it). */
function postMcp(
  host: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(INITIALIZE)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          host,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'content-length': Buffer.byteLength(payload),
          ...extraHeaders,
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

describe('allowedHosts', () => {
  it('covers localhost and the docker service name on the port', () => {
    expect(allowedHosts(13336, {})).toEqual([
      'localhost',
      '127.0.0.1',
      'localhost:13336',
      '127.0.0.1:13336',
      'mcp',
      'mcp:13336',
    ])
  })

  it('adds MCP_ALLOWED_HOSTS', () => {
    expect(allowedHosts(1, { MCP_ALLOWED_HOSTS: ' taia.example.com , ,mcp.internal:443' })).toEqual(
      expect.arrayContaining(['taia.example.com', 'mcp.internal:443']),
    )
  })
})

describe('MCP HTTP app', () => {
  it('answers the health probe', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('initializes an MCP session over POST /mcp', async () => {
    const res = await postMcp(`127.0.0.1:${port}`)

    expect(res.status).toBe(200)
    expect(res.body).toContain('"serverInfo"')
  })

  it('refuses a request whose Host header is not allowed (DNS rebinding)', async () => {
    const res = await postMcp('evil.example.com')

    expect(res.status).toBe(403)
    expect(res.body).not.toContain('"serverInfo"')
  })

  it.each(['GET', 'DELETE'])('answers 405 to %s /mcp', async (method) => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method })

    expect(res.status).toBe(405)
  })
})

describe('MCP HTTP app with TAIA_API_TOKEN', () => {
  const TOKEN = 'a-test-token-0123456789'

  afterEach(() => {
    delete process.env.TAIA_API_TOKEN
  })

  beforeEach(() => {
    verify.mockReset().mockResolvedValue(null)
  })

  const DB_TOKEN = `taia_abcdefgh_${'a'.repeat(43)}`

  it.each(['agent', 'admin'])(
    'serves an access token from the database (%s scope)',
    async (scope) => {
      process.env.TAIA_API_TOKEN = TOKEN
      verify.mockResolvedValue({ id: 'abcdefgh', scope })

      const res = await postMcp(`127.0.0.1:${port}`, { authorization: `Bearer ${DB_TOKEN}` })

      expect(res.status).toBe(200)
      expect(verify).toHaveBeenCalledWith(DB_TOKEN)
    },
  )

  it('refuses a revoked or unknown access token', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    const res = await postMcp(`127.0.0.1:${port}`, { 'x-api-key': DB_TOKEN })

    expect(res.status).toBe(401)
  })

  it('answers 503 when the token cannot be checked', async () => {
    process.env.TAIA_API_TOKEN = TOKEN
    verify.mockRejectedValue(new Error('db down'))

    const res = await postMcp(`127.0.0.1:${port}`, { authorization: `Bearer ${DB_TOKEN}` })

    expect(res.status).toBe(503)
  })

  it('refuses a request without the token', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    const res = await postMcp(`127.0.0.1:${port}`)

    expect(res.status).toBe(401)
    expect(res.body).not.toContain('"serverInfo"')
  })

  it('refuses a wrong token', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    const res = await postMcp(`127.0.0.1:${port}`, { authorization: 'Bearer not-the-right-token' })

    expect(res.status).toBe(401)
  })

  it('serves a request that carries the token', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    const res = await postMcp(`127.0.0.1:${port}`, { authorization: `Bearer ${TOKEN}` })

    expect(res.status).toBe(200)
    expect(res.body).toContain('"serverInfo"')
  })

  it('keeps the health probe open', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200)
  })
})
