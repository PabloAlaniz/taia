// Smoke test: trigger.service.ts — MUTATE only, requires gateway + DB

import { isWSConnectable, isDBAvailable, canMutate, initTestRuntimeAdapter } from '../setup'

const [wsAvail, dbAvail] = await Promise.all([isWSConnectable(), isDBAvailable()])
const skipAll = !wsAvail || !dbAvail || !canMutate()
if (skipAll)
  console.warn(
    `\u26A0 Skipping trigger-service smoke — ws: ${wsAvail}, db: ${dbAvail}, mutate: ${canMutate()}`,
  )

let triggerAgentHeartbeat: typeof import('@taia/core/services/trigger.service').triggerAgentHeartbeat
let knownAgentId: string | null = null

describe.skipIf(skipAll)('trigger.service — Smoke Tests [MUTATE]', () => {
  beforeAll(async () => {
    const adapter = await initTestRuntimeAdapter()
    const agents = await adapter.listAgents()
    knownAgentId = agents[0]?.id || null

    const mod = await import('@taia/core/services/trigger.service')
    triggerAgentHeartbeat = mod.triggerAgentHeartbeat
  })

  it('triggerAgentHeartbeat(agentId) returns ok', async () => {
    expect(knownAgentId).not.toBeNull()

    const result = await triggerAgentHeartbeat(knownAgentId!)
    expect(result.ok).toBe(true)
    expect(result.agentId).toBe(knownAgentId)
    expect(typeof result.sessionKey).toBe('string')
    expect(typeof result.runId).toBe('string')
  })

  it('triggerAgentHeartbeat with invalid agent returns ok:false', async () => {
    const result = await triggerAgentHeartbeat('nonexistent-agent-' + Date.now())
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error!.length).toBeGreaterThan(0)
  })
})
