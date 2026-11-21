// Smoke test: fan-out over several runtime instances — requires gateway + PostgreSQL.
// A second OpenClaw instance points at a port nothing listens on: the board
// must keep working from the live gateway and report the dead one.

import { isWSConnectable, isDBAvailable, initTestRuntimeAdapter } from '../setup'
import { getTestPool } from '../db/test-db-helper'

const [wsAvail, dbAvail] = await Promise.all([isWSConnectable(), isDBAvailable()])
const skipAll = !wsAvail || !dbAvail
if (skipAll) console.warn(`⚠ Skipping runtime fan-out smoke — ws: ${wsAvail}, db: ${dbAvail}`)

const DEAD = 'gw-down'

describe.skipIf(skipAll)('runtime fan-out — Smoke Tests', () => {
  beforeAll(async () => {
    await initTestRuntimeAdapter()
    const { setSetting, upsertRuntimeInstance } = await import('@taia/core/db')
    await upsertRuntimeInstance({
      id: DEAD,
      provider: 'openclaw',
      label: 'Down gateway',
      config: { url: 'ws://127.0.0.1:9' },
    })
    await setSetting(`runtime.instances.${DEAD}.token`, 'unused')
  })

  afterAll(async () => {
    const { disposeRuntimeAdapter } = await import('@taia/core/runtime')
    disposeRuntimeAdapter(DEAD)
    const pool = getTestPool()
    await pool.query("DELETE FROM agent_runtime_settings WHERE agent_id LIKE 'fanout-%'")
    await pool.query("DELETE FROM agents WHERE id LIKE 'fanout-%'")
    await pool.query(`DELETE FROM settings WHERE key LIKE 'runtime.instances.${DEAD}.%'`)
    await pool.query('DELETE FROM runtime_instances WHERE id = $1', [DEAD])
  })

  it('reports the live gateway connected and the dead one disconnected', async () => {
    const { getRuntimeHealth } = await import('@taia/core/services/runtime-health.service')
    const health = await getRuntimeHealth()

    expect(health.state).toBe('degraded')
    expect(health.instances.map((i) => [i.instanceId, i.state])).toEqual([
      ['openclaw', 'connected'],
      [DEAD, 'disconnected'],
    ])
  })

  it('lists the squad and the sessions of the live gateway', async () => {
    const { fetchEnrichedAgents } = await import('@taia/core/services/agent.service')
    const { listSessions } = await import('@taia/core/services/session.service')

    const { source, agents } = await fetchEnrichedAgents(false)
    expect(source).toBe('runtime')
    expect(agents.length).toBeGreaterThanOrEqual(1)

    const sessions = await listSessions({ limit: 20 })
    for (const session of sessions) expect(session.instanceId).toBe('openclaw')
  })

  it('keeps the agents of the dead instance on the board, from the database', async () => {
    const { fetchEnrichedAgents } = await import('@taia/core/services/agent.service')
    const { createAgent, setAgentRuntimeInstanceId, listAgentRuntimeInstanceIds } = await import(
      '@taia/core/db'
    )
    // Agents the live gateway does not know: one on the dead instance, one on the default.
    await createAgent({ id: 'fanout-stranded', name: 'Stranded', type: 'cron' })
    await createAgent({ id: 'fanout-orphan', name: 'Orphan', type: 'cron' })
    await setAgentRuntimeInstanceId('fanout-stranded', DEAD)
    expect((await listAgentRuntimeInstanceIds()).get('fanout-stranded')).toBe(DEAD)

    const ids = (await fetchEnrichedAgents(false)).agents.map((a) => a.id)

    expect(ids).toContain('fanout-stranded')
    expect(ids).not.toContain('fanout-orphan')
  })
})
