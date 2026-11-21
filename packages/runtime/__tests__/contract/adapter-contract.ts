// Reusable contract test suite — every AgentRuntimeAdapter implementation
// should pass `runAdapterContract(makeAdapter)`. The suite checks invariants
// that hold regardless of the underlying runtime.

import { describe, it, expect } from 'vitest'
import {
  RuntimeCapability,
  type AgentRuntimeAdapter,
  type RuntimeAgent,
  type SpawnResult,
} from '@taia/runtime'

export interface ContractOptions {
  /** Identifier used in the suite description. */
  name: string
  /** Build a fresh adapter per test. */
  makeAdapter: () => AgentRuntimeAdapter | Promise<AgentRuntimeAdapter>
  /** Skip mutation tests when true (e.g. read-only or remote runtimes). */
  skipMutation?: boolean
}

export function runAdapterContract(opts: ContractOptions): void {
  describe(`AgentRuntimeAdapter contract — ${opts.name}`, () => {
    it('declares an id and a CapabilitySet', async () => {
      const adapter = await opts.makeAdapter()
      expect(typeof adapter.id).toBe('string')
      expect(adapter.id.length).toBeGreaterThan(0)
      expect(adapter.capabilities).toBeDefined()
      expect(typeof adapter.capabilities.has).toBe('function')
      expect(Array.isArray(adapter.capabilities.list())).toBe(true)
    })

    it('reports capabilities consistently with implemented methods', async () => {
      const adapter = await opts.makeAdapter()
      const checks: Array<[RuntimeCapability, keyof AgentRuntimeAdapter]> = [
        [RuntimeCapability.Sessions, 'spawnSession'],
        [RuntimeCapability.Sessions, 'listSessions'],
        [RuntimeCapability.Transcripts, 'getSessionHistory'],
        [RuntimeCapability.Cron, 'listCrons'],
        [RuntimeCapability.Cron, 'cronAction'],
        [RuntimeCapability.LiveEvents, 'on'],
        [RuntimeCapability.Messaging, 'sendChannelMessage'],
        [RuntimeCapability.ContextSync, 'projectAgentContext'],
        [RuntimeCapability.ContextSync, 'syncAgentContext'],
        [RuntimeCapability.RuntimeSettingsRead, 'getRuntimeSettings'],
        [RuntimeCapability.AgentProvisioning, 'provisionAgent'],
        [RuntimeCapability.AgentProvisioning, 'updateAgentSettings'],
        [RuntimeCapability.AgentProvisioning, 'deprovisionAgent'],
        [RuntimeCapability.NativeConfig, 'getNativeConfig'],
        [RuntimeCapability.NativeConfig, 'patchNativeConfig'],
      ]

      for (const [cap, method] of checks) {
        if (adapter.capabilities.has(cap)) {
          expect(
            adapter[method],
            `Adapter "${adapter.id}" declares capability "${cap}" but does not implement "${String(method)}"`,
          ).toBeDefined()
        }
      }
    })

    it('listAgents returns RuntimeAgent[] with required fields', async () => {
      const adapter = await opts.makeAdapter()
      const agents = await adapter.listAgents()
      expect(Array.isArray(agents)).toBe(true)
      for (const agent of agents) {
        expect(typeof agent.id).toBe('string')
        expect(agent.id.length).toBeGreaterThan(0)
      }
    })

    it('getHealth resolves to a RuntimeHealth shape and never throws', async () => {
      const adapter = await opts.makeAdapter()
      const health = await adapter.getHealth().catch((err) => {
        throw new Error(`getHealth must not throw, but threw: ${(err as Error).message}`)
      })
      expect(typeof health.ok).toBe('boolean')
    })

    it('isAvailable returns a boolean', async () => {
      const adapter = await opts.makeAdapter()
      const available = await adapter.isAvailable()
      expect(typeof available).toBe('boolean')
    })

    it('getConnectionState returns a known state literal', async () => {
      const adapter = await opts.makeAdapter()
      const state = adapter.getConnectionState()
      expect(['disconnected', 'connecting', 'connected', 'reconnecting']).toContain(state)
    })

    if (!opts.skipMutation) {
      it('spawnSession returns canonical sessionKey (not childSessionKey)', async () => {
        const adapter = await opts.makeAdapter()
        if (!adapter.capabilities.has(RuntimeCapability.Sessions) || !adapter.spawnSession) {
          return
        }
        const result: SpawnResult = await adapter.spawnSession('contract-test')
        expect(result.status).toBe('accepted')
        expect(typeof result.runId).toBe('string')
        expect(typeof result.sessionKey).toBe('string')
        expect((result as unknown as Record<string, unknown>).childSessionKey).toBeUndefined()
      })
    }

    it('getProviderDefaults (when present) returns an object', async () => {
      const adapter = await opts.makeAdapter()
      if (!adapter.getProviderDefaults) return
      const defaults = adapter.getProviderDefaults()
      expect(typeof defaults).toBe('object')
      expect(defaults).not.toBeNull()
    })

    it('listAgents handles being called twice without side effects', async () => {
      const adapter = await opts.makeAdapter()
      const a1 = (await adapter.listAgents()) as RuntimeAgent[]
      const a2 = (await adapter.listAgents()) as RuntimeAgent[]
      expect(a1.length).toBe(a2.length)
    })
  })
}
