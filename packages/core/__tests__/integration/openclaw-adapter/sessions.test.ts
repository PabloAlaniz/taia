// Integration: sessions — listing, history, spawn and wait

import { createTestClient, isWSConnectable, canMutate } from '../setup'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping sessions tests')

let client: OpenClawClient

describe.skipIf(skipAll)('OpenClawClient — Sessions', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
  })

  afterAll(() => {
    client?.disconnect()
  })

  it('listSessions returns rows with key, agentId and timestamps', async () => {
    const sessions = await client.listSessions({ limit: 10 })
    expect(sessions.length).toBeLessThanOrEqual(10)
    for (const session of sessions) {
      expect(typeof session.key).toBe('string')
      expect(typeof session.sessionId).toBe('string')
      expect(typeof session.updatedAt).toBe('number')
    }
  })

  it('getSessionHistory returns messages for an existing session', async () => {
    const [session] = await client.listSessions({ limit: 1 })
    if (!session) {
      console.warn('No sessions available — skipping history test')
      return
    }
    const messages = await client.getSessionHistory(session.key, { limit: 20 })
    for (const msg of messages) {
      expect(typeof msg.role).toBe('string')
      expect(msg.content).toBeDefined()
    }
  })

  describe.skipIf(!canMutate())('[MUTATE] spawn', () => {
    it('sessions.create starts a run whose prompt lands in the transcript', async () => {
      const [agent] = await client.listAgents()
      const task = `integration-test: echo hello ${Date.now()}`
      const result = await client.spawnSession(task, {
        agentId: agent.id,
        label: `integration-test-${Date.now()}`,
        runTimeoutSeconds: 30,
      })

      expect(typeof result.key).toBe('string')
      expect(typeof result.runId).toBe('string')

      // Admission is acknowledged before the turn is persisted; poll briefly.
      const hasPrompt = async () =>
        (await client.getSessionHistory(result.key)).some(
          (m) => m.role === 'user' && String(m.content).includes(task),
        )
      let found = false
      for (let i = 0; i < 20 && !found; i++) {
        found = await hasPrompt()
        if (!found) await new Promise((r) => setTimeout(r, 250))
      }
      expect(found).toBe(true)
    })
  })
})
