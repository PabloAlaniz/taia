import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowedHosts, createHttpApp } from '../src/http-app'
import { DEFAULT_MCP_LIMIT, mcpPolicy, mcpRateLimitMode } from '../src/rate-limit'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
  vi.restoreAllMocks()
})

/** Start the app with `env` and return a function that POSTs /mcp. */
async function start(env: Record<string, string>) {
  const hosts: string[] = []
  const server = createHttpApp(hosts, env).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  hosts.push(...allowedHosts(port, {}))
  return async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })
    return {
      status: res.status,
      retryAfter: res.headers.get('retry-after'),
      text: await res.text(),
    }
  }
}

describe('POST /mcp rate limit', () => {
  it('enforce: answers 429 with a JSON-RPC error and Retry-After once the limit is spent', async () => {
    const post = await start({
      TAIA_MCP_RATE_LIMIT: '2/minute',
      TAIA_MCP_RATE_LIMIT_MODE: 'enforce',
    })
    expect((await post()).status).not.toBe(429)
    expect((await post()).status).not.toBe(429)

    const refused = await post()

    expect(refused.status).toBe(429)
    expect(Number(refused.retryAfter)).toBeGreaterThan(0)
    expect(JSON.parse(refused.text)).toMatchObject({ jsonrpc: '2.0', error: { code: -32029 } })
  })

  it('shadow (default): lets everything through and logs what it would refuse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const post = await start({ TAIA_MCP_RATE_LIMIT: '1/minute' })

    for (let i = 0; i < 3; i++) {
      const res = await post()
      expect(res.status).not.toBe(429)
      expect(res.retryAfter).toBeNull()
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('would be refused'))
  })

  it('off: no limit', async () => {
    const post = await start({ TAIA_MCP_RATE_LIMIT: '1/minute', TAIA_MCP_RATE_LIMIT_MODE: 'off' })
    for (let i = 0; i < 3; i++) expect((await post()).status).not.toBe(429)
  })
})

describe('mcpPolicy and mcpRateLimitMode', () => {
  it('read the environment, with defaults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(mcpRateLimitMode({})).toBe('shadow')
    expect(mcpRateLimitMode({ TAIA_MCP_RATE_LIMIT_MODE: 'Enforce' })).toBe('enforce')
    expect(mcpPolicy({ TAIA_MCP_RATE_LIMIT: '30/second' })).toEqual({ limit: 30, windowMs: 1000 })
    expect(mcpPolicy({ TAIA_MCP_RATE_LIMIT: 'many' })).toEqual(
      mcpPolicy({ TAIA_MCP_RATE_LIMIT: DEFAULT_MCP_LIMIT }),
    )
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
