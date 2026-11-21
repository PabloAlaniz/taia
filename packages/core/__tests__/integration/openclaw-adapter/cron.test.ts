// Integration: cron jobs over cron.* RPCs

import { canMutate, createTestClient, isWSConnectable } from '../setup'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping cron tests')

let client: OpenClawClient

describe.skipIf(skipAll)('OpenClawClient — Cron', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
  })

  afterAll(() => {
    client?.disconnect()
  })

  it('listCrons returns jobs with a schedule', async () => {
    const crons = await client.listCrons()
    for (const cron of crons) {
      expect(typeof cron.id).toBe('string')
      expect(typeof cron.enabled).toBe('boolean')
      expect(typeof cron.schedule.kind).toBe('string')
      if (cron.schedule.kind === 'cron') expect(typeof cron.schedule.expr).toBe('string')
      if (cron.schedule.kind === 'every') expect(cron.schedule.everyMs).toBeGreaterThan(0)
    }
  })

  it('listCrons(false) returns only enabled jobs', async () => {
    for (const cron of await client.listCrons(false)) {
      expect(cron.enabled).toBe(true)
    }
  })

  it('cronAction("status") responds', async () => {
    expect(await client.cronAction('status')).toBeDefined()
  })

  describe.skipIf(!canMutate())('[MUTATE] lifecycle', () => {
    it('adds, disables and removes a TAIA heartbeat job', async () => {
      const [agent] = await client.listAgents()
      const created = (await client.cronAction('add', {
        agentId: agent.id,
        name: `taia-integration-${Date.now()}`,
        schedule: { kind: 'cron', expr: '0 3 * * *', tz: 'UTC' },
        enabled: true,
      })) as { id: string }
      expect(typeof created.id).toBe('string')

      try {
        await client.cronAction('update', { id: created.id, enabled: false })
        const job = (await client.listCrons(true)).find((j) => j.id === created.id)
        expect(job?.enabled).toBe(false)
        expect(job?.declarationKey).toBeUndefined()
      } finally {
        await client.cronAction('remove', { id: created.id })
      }

      expect((await client.listCrons(true)).some((j) => j.id === created.id)).toBe(false)
    })
  })
})
