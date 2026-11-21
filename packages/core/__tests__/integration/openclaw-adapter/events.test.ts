// Integration: push events

import { canMutate, createTestClient, isWSConnectable } from '../setup'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping events tests')

let client: OpenClawClient

describe.skipIf(skipAll)('OpenClawClient — Events', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
  })

  afterAll(() => {
    client?.disconnect()
  })

  it('on() returns an unsubscribe function', () => {
    const unsub = client.on('chat', () => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  describe.skipIf(!canMutate())('[MUTATE] run events', () => {
    it('emits chat or agent events for a spawned run', async () => {
      const [agent] = await client.listAgents()
      const seen: string[] = []
      const offChat = client.on('chat', () => seen.push('chat'))
      const offAgent = client.on('agent', () => seen.push('agent'))
      try {
        await client.spawnSession('integration-test: say hi', {
          agentId: agent.id,
          label: `integration-events-${Date.now()}`,
          runTimeoutSeconds: 30,
        })
        await new Promise((r) => setTimeout(r, 5_000))
        expect(seen.length).toBeGreaterThan(0)
      } finally {
        offChat()
        offAgent()
      }
    })
  })
})
