// Smoke test: agent-runtime.ts against a real gateway (no mocks)

import { isWSConnectable, initTestRuntimeAdapter } from '../setup'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('\u26A0 WS not connectable — skipping agent-runtime smoke tests')

// Lazy import after client is initialized to avoid singleton issues
let listAgents: typeof import('@taia/core/agent-runtime').listAgents
let getAgentSessions: typeof import('@taia/core/agent-runtime').getAgentSessions
let readTranscript: typeof import('@taia/core/agent-runtime').readTranscript
let getAgentInfo: typeof import('@taia/core/agent-runtime').getAgentInfo
let listAgentsWithStatus: typeof import('@taia/core/agent-runtime').listAgentsWithStatus

let knownAgentId: string | null = null

describe.skipIf(skipAll)('agent-runtime — Smoke Tests', () => {
  beforeAll(async () => {
    // Register the OpenClaw adapter with the runtime registry before consumers
    // resolve it via getDefaultRuntimeAdapter().
    const adapter = await initTestRuntimeAdapter()
    const agents = await adapter.listAgents()
    knownAgentId = agents[0]?.id || null

    const mod = await import('@taia/core/agent-runtime')
    listAgents = mod.listAgents
    getAgentSessions = mod.getAgentSessions
    readTranscript = mod.readTranscript
    getAgentInfo = mod.getAgentInfo
    listAgentsWithStatus = mod.listAgentsWithStatus
  })

  it('listAgents returns string[]', async () => {
    const agents = await listAgents()
    expect(Array.isArray(agents)).toBe(true)
    expect(agents.length).toBeGreaterThanOrEqual(1)
    for (const id of agents) {
      expect(typeof id).toBe('string')
    }
  })

  it('getAgentSessions returns AgentSession[] for known agent', async () => {
    if (!knownAgentId) {
      console.warn('No known agent — skipping')
      return
    }

    const sessions = await getAgentSessions(knownAgentId)
    expect(Array.isArray(sessions)).toBe(true)
    for (const s of sessions) {
      expect(typeof s.key).toBe('string')
      expect(typeof s.sessionId).toBe('string')
      expect(typeof s.updatedAt).toBe('number')
    }
  })

  it('readTranscript returns filtered messages', async () => {
    if (!knownAgentId) {
      console.warn('No known agent — skipping')
      return
    }

    const messages = await readTranscript(knownAgentId, 'main', 5)
    expect(Array.isArray(messages)).toBe(true)
    for (const msg of messages) {
      expect(['user', 'assistant']).toContain(msg.role)
    }
  })

  it('getAgentInfo for non-existent agent returns null', async () => {
    const info = await getAgentInfo('nonexistent-agent-' + Date.now())
    expect(info).toBeNull()
  })

  it('listAgentsWithStatus returns AgentInfo[]', async () => {
    const agents = await listAgentsWithStatus()
    expect(Array.isArray(agents)).toBe(true)
    for (const agent of agents) {
      expect(typeof agent.id).toBe('string')
      expect(Array.isArray(agent.sessions)).toBe(true)
    }
  })
})
