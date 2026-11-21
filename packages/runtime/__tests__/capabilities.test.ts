import { describe, it, expect } from 'vitest'
import {
  CapabilitySet,
  RuntimeCapability,
  requireCapabilityMethod,
  type AgentRuntimeAdapter,
} from '@taia/runtime'

describe('CapabilitySet', () => {
  it('reports membership for declared capabilities', () => {
    const caps = new CapabilitySet([RuntimeCapability.Sessions, RuntimeCapability.Cron])
    expect(caps.has(RuntimeCapability.Sessions)).toBe(true)
    expect(caps.has(RuntimeCapability.Cron)).toBe(true)
  })

  it('reports false for capabilities that were not declared', () => {
    const caps = new CapabilitySet([RuntimeCapability.Sessions])
    expect(caps.has(RuntimeCapability.Cron)).toBe(false)
    expect(caps.has(RuntimeCapability.Approvals)).toBe(false)
  })

  it('lists every declared capability exactly once', () => {
    const caps = new CapabilitySet([
      RuntimeCapability.Sessions,
      RuntimeCapability.Sessions,
      RuntimeCapability.Health,
    ])
    const list = caps.list()
    expect(list).toEqual(
      expect.arrayContaining([RuntimeCapability.Sessions, RuntimeCapability.Health]),
    )
    expect(list.length).toBe(2)
  })
})

describe('requireCapabilityMethod', () => {
  it('returns the method bound to its adapter', async () => {
    class Adapter {
      readonly id = 'x'
      readonly capabilities = new CapabilitySet([RuntimeCapability.Sessions])
      private readonly prefix = 'run'
      async spawnSession(task: string) {
        return `${this.prefix}:${task}`
      }
    }
    const spawn = requireCapabilityMethod(
      new Adapter() as unknown as AgentRuntimeAdapter,
      RuntimeCapability.Sessions,
      'spawnSession',
    )
    await expect(spawn('t')).resolves.toBe('run:t')
  })

  it('throws when the capability is not declared', () => {
    const adapter = {
      id: 'x',
      capabilities: new CapabilitySet([]),
      spawnSession: async () => ({}),
    } as unknown as AgentRuntimeAdapter
    expect(() =>
      requireCapabilityMethod(adapter, RuntimeCapability.Sessions, 'spawnSession'),
    ).toThrow()
  })
})
