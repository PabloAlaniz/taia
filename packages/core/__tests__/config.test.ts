import { afterEach, describe, expect, it, vi } from 'vitest'

const VARS = ['APP_PORT', 'WS_PORT', 'BROADCAST_PORT', 'TAIA_URL', 'WS_CLIENT_URL', 'BROADCAST_URL']

async function loadConfig(env: Record<string, string>) {
  for (const name of VARS) delete process.env[name]
  Object.assign(process.env, env)
  vi.resetModules()
  return (await import('@taia/core/config')).config
}

afterEach(() => {
  for (const name of VARS) delete process.env[name]
})

describe('config', () => {
  it('uses the default ports', async () => {
    const config = await loadConfig({})

    expect(config.taia.url).toBe('http://localhost:13333')
    expect(config.ws.clientUrl).toBe('ws://localhost:13334')
    expect(config.broadcast.url).toBe('http://localhost:13335/broadcast')
  })

  it('derives the default URLs from the configured ports', async () => {
    const config = await loadConfig({
      APP_PORT: '14333',
      WS_PORT: '14334',
      BROADCAST_PORT: '14335',
    })

    expect(config.taia.url).toBe('http://localhost:14333')
    expect(config.ws.clientUrl).toBe('ws://localhost:14334')
    expect(config.broadcast.url).toBe('http://localhost:14335/broadcast')
  })

  it('lets an explicit URL win over the port', async () => {
    const config = await loadConfig({
      WS_PORT: '14334',
      WS_CLIENT_URL: 'wss://taia.example.com/ws',
    })

    expect(config.ws.clientUrl).toBe('wss://taia.example.com/ws')
  })
})
