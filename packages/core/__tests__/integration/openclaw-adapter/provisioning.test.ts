// Integration: creating agents and writing their settings through
// agents.create / agents.update / config.patch / agents.delete

import { canMutate, createTestClient, isWSConnectable } from '../setup'
import { OpenClawAdapter } from '@taia/runtime/adapters/openclaw'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'

const skipAll = !(await isWSConnectable()) || !canMutate()
if (skipAll) console.warn('⚠ WS not connectable or mutation disabled — skipping provisioning tests')

const AGENT_ID = `it-prov-${Date.now().toString(36)}`
const OPUS = 'anthropic/claude-opus-5-5'
const SONNET = 'anthropic/claude-sonnet-5-5'

let client: OpenClawClient
let adapter: OpenClawAdapter

describe.skipIf(skipAll)('[MUTATE] OpenClawAdapter — agent provisioning', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
    adapter = new OpenClawAdapter(client)
  })

  afterAll(async () => {
    await client?.deleteAgent(AGENT_ID, true).catch(() => {})
    client?.disconnect()
  })

  it('creates the agent under its id with name, model, fallbacks and denied tools', async () => {
    const outcome = await adapter.provisionAgent({
      id: AGENT_ID,
      name: 'Integration Provisioned',
      settings: { model: { primary: OPUS, fallbacks: [SONNET] }, deniedTools: ['exec'] },
    })

    expect(outcome.status).toBe('created')
    expect(outcome.effective).toMatchObject({
      model: { primary: OPUS, fallbacks: [SONNET] },
      deniedTools: ['exec'],
    })
    const agents = await adapter.listAgents()
    expect(agents.find((a) => a.id === AGENT_ID)?.name).toBe('Integration Provisioned')
    // agents.create seeds the workspace bootstrap files.
    const soul = await client.getAgentFile(AGENT_ID, 'SOUL.md')
    expect(soul.missing).toBe(false)
  })

  it('leaves an existing agent as it is', async () => {
    const outcome = await adapter.provisionAgent({ id: AGENT_ID, name: 'Other', settings: {} })
    expect(outcome.status).toBe('exists')
    expect(outcome.effective?.model?.primary).toBe(OPUS)
  })

  it('shrinks and resets settings, keeping what the update omits', async () => {
    const shrunk = await adapter.updateAgentSettings(AGENT_ID, {
      model: { primary: SONNET, fallbacks: [] },
    })
    expect(shrunk.status).toBe('updated')
    expect(shrunk.effective).toMatchObject({
      model: { primary: SONNET, fallbacks: [] },
      deniedTools: ['exec'],
    })

    const reset = await adapter.updateAgentSettings(AGENT_ID, { model: null, deniedTools: null })
    expect(reset.status).toBe('updated')
    expect(reset.effective?.model).toBeUndefined()
    expect(reset.effective?.deniedTools).toBeUndefined()
  })

  it('refuses to configure an agent the gateway does not have', async () => {
    const outcome = await adapter.updateAgentSettings(`${AGENT_ID}-ghost`, { deniedTools: ['x'] })
    expect(outcome.status).toBe('failed')
  })

  it('deprovisions the agent, and does it again without failing', async () => {
    await adapter.deprovisionAgent(AGENT_ID)
    expect((await adapter.getRuntimeSettings()).agents[AGENT_ID]).toBeUndefined()
    await expect(adapter.deprovisionAgent(AGENT_ID)).resolves.toBeUndefined()
  })
})
