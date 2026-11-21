// Smoke test: agent.service.ts — requires gateway + PostgreSQL

import { isWSConnectable, isDBAvailable, initTestRuntimeAdapter } from '../setup'

const [wsAvail, dbAvail] = await Promise.all([isWSConnectable(), isDBAvailable()])
const skipAll = !wsAvail || !dbAvail
if (skipAll) console.warn(`\u26A0 Skipping agent-service smoke — ws: ${wsAvail}, db: ${dbAvail}`)

let fetchEnrichedAgents: typeof import('@taia/core/services/agent.service').fetchEnrichedAgents

describe.skipIf(skipAll)('agent.service — Smoke Tests', () => {
  beforeAll(async () => {
    await initTestRuntimeAdapter()
    const mod = await import('@taia/core/services/agent.service')
    fetchEnrichedAgents = mod.fetchEnrichedAgents
  })

  it('fetchEnrichedAgents(false) returns source="runtime"', async () => {
    const result = await fetchEnrichedAgents(false)
    expect(result.source).toBe('runtime')
    expect(Array.isArray(result.agents)).toBe(true)
    expect(result.agents.length).toBeGreaterThanOrEqual(1)
  })

  it('agents have required fields', async () => {
    const { agents } = await fetchEnrichedAgents(false)
    for (const agent of agents) {
      expect(typeof agent.id).toBe('string')
      expect(typeof agent.name).toBe('string')
      expect(typeof agent.role).toBe('string')
      expect(typeof agent.avatar).toBe('string')
      expect(typeof agent.status).toBe('string')
      expect(typeof agent.enabled).toBe('boolean')
    }
  })

  it('status is a valid value', async () => {
    const { agents } = await fetchEnrichedAgents(false)
    const validStatuses = ['IDLE', 'WORKING', 'BLOCKED']
    for (const agent of agents) {
      expect(validStatuses).toContain(agent.status)
    }
  })

  it('fetchEnrichedAgents(true) includes detail', async () => {
    const { agents } = await fetchEnrichedAgents(true)
    expect(agents.length).toBeGreaterThanOrEqual(1)

    const hasDetail = agents.some((a) => a.tasks || a.cron || a.files)
    expect(hasDetail).toBe(true)
  })
})
