// Integration: gateway configuration and health

import { createTestClient, isWSConnectable } from '../setup'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping config tests')

let client: OpenClawClient

describe.skipIf(skipAll)('OpenClawClient — Config', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
  })

  afterAll(() => {
    client?.disconnect()
  })

  it('getGatewayConfig returns the config and its revision hash', async () => {
    const { config, hash } = await client.getGatewayConfig()
    expect(config).toBeDefined()
    expect(typeof hash).toBe('string')
  })

  it('agents are keyed by id under agents.entries', async () => {
    const { config } = await client.getGatewayConfig()
    const agents = await client.listAgents()
    const entryIds = Object.keys(config.agents?.entries ?? {})
    for (const id of entryIds) {
      expect(agents.map((a) => a.id)).toContain(id)
    }
  })

  it('getHealth reports ok with uptime from the hello snapshot', async () => {
    const health = await client.getHealth()
    expect(health.ok).toBe(true)
    expect(typeof health.uptime).toBe('number')
  })
})
