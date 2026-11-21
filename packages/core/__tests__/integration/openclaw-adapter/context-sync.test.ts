// Integration: pushing agent context to workspace files over agents.files.*

import { canMutate, createTestClient, isWSConnectable } from '../setup'
import { OpenClawAdapter } from '@taia/runtime/adapters/openclaw'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'
import type { AgentContextBundle } from '@taia/types'

const skipAll = !(await isWSConnectable())
if (skipAll) console.warn('⚠ WS not connectable — skipping context sync tests')

const FILES = ['SOUL.md', 'IDENTITY.md', 'AGENTS.md', 'USER.md']

let client: OpenClawClient

function bundleFor(agentId: string, persona: string): AgentContextBundle {
  return {
    agent: {
      id: agentId,
      name: 'Integration Agent',
      role: 'Tester',
      persona,
      instructions: 'Run the checks.',
      capabilities: ['read_tasks'],
    },
    project: { name: 'TAIA', description: 'Integration project.' },
    user: { id: 'default', displayName: 'Integration' },
    task: { title: 'Heartbeat', description: '', priority: 'MEDIUM', status: 'INBOX' },
    memory: { recall: [], archival: [], working: {} },
  }
}

describe.skipIf(skipAll)('OpenClawAdapter — context sync', () => {
  beforeAll(async () => {
    client = createTestClient()
    await client.connect()
  })

  afterAll(() => {
    client?.disconnect()
  })

  it('reads workspace files with their hash', async () => {
    const [agent] = await client.listAgents()
    const file = await client.getAgentFile(agent.id, 'SOUL.md')
    expect(file.name).toBe('SOUL.md')
    if (!file.missing) expect(file.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  describe.skipIf(!canMutate())('[MUTATE] push', () => {
    let agentId: string
    const original = new Map<string, string | undefined>()

    beforeAll(async () => {
      ;[{ id: agentId }] = await client.listAgents()
      for (const name of FILES) {
        const file = await client.getAgentFile(agentId, name)
        original.set(name, file.missing ? undefined : file.content)
      }
    })

    afterAll(async () => {
      // Put back what the workspace held before the test.
      for (const [name, content] of original) {
        if (content !== undefined) await client.setAgentFile(agentId, name, content)
      }
    })

    it('pushes, detects an edit made in the workspace, and overwrites it with force', async () => {
      const adapter = new OpenClawAdapter(client, { contextSync: 'push' })

      const first = await adapter.syncAgentContext({
        agentId,
        bundle: bundleFor(agentId, 'First persona.'),
      })
      expect(first.status).toBe('pushed')
      expect((await client.getAgentFile(agentId, 'SOUL.md')).content).toContain('First persona.')

      const soul = await client.getAgentFile(agentId, 'SOUL.md')
      await client.setAgentFile(agentId, 'SOUL.md', `${soul.content}\nEdited by the agent.\n`, {
        expectedHash: soul.hash!,
      })

      const conflicted = await adapter.syncAgentContext({
        agentId,
        bundle: bundleFor(agentId, 'Second persona.'),
        previous: first.state,
      })
      expect(conflicted.status).toBe('conflict')
      expect((await client.getAgentFile(agentId, 'SOUL.md')).content).toContain(
        'Edited by the agent.',
      )

      const forced = await adapter.syncAgentContext({
        agentId,
        bundle: bundleFor(agentId, 'Second persona.'),
        previous: conflicted.state,
        force: true,
      })
      expect(forced.status).toBe('pushed')
      expect((await client.getAgentFile(agentId, 'SOUL.md')).content).toContain('Second persona.')
    })
  })
})
