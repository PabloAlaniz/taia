// Integration: agent listing and per-agent config

import { createTestClient, isWSConnectable } from '../setup'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'
import { toRuntimeSettingsSnapshot } from '@taia/runtime/adapters/openclaw/mappers'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping agents tests')

let client: OpenClawClient

describe.skipIf(skipAll)('OpenClawClient — Agents', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
  })

  afterAll(() => {
    client?.disconnect()
  })

  it('listAgents returns at least one agent with an id', async () => {
    const agents = await client.listAgents()
    expect(agents.length).toBeGreaterThanOrEqual(1)
    for (const agent of agents) {
      expect(typeof agent.id).toBe('string')
      expect(agent.id.length).toBeGreaterThan(0)
    }
  })

  it('runtime settings list the agents the gateway lists', async () => {
    const agents = await client.listAgents()
    const settings = toRuntimeSettingsSnapshot(await client.getGatewayConfig())
    const agentIds = new Set(agents.map((a) => a.id))

    // Opaque token (e.g. hmac-sha256:v1:…), used as a write precondition.
    expect(settings.revision).toEqual(expect.any(String))
    for (const [id, agent] of Object.entries(settings.agents)) {
      expect(agentIds.has(id)).toBe(true)
      if (agent.model) expect(typeof agent.model.primary).toBe('string')
    }
  })

  it('listAgents is idempotent', async () => {
    const first = (await client.listAgents()).map((a) => a.id).sort()
    const second = (await client.listAgents()).map((a) => a.id).sort()
    expect(first).toEqual(second)
  })
})
