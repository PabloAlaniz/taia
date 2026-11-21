// No-op runtime adapter — used when TAIA runs standalone (no runtime
// configured). Declares zero capabilities, so any service that calls a
// capability-gated method gets a clean RuntimeCapabilityError instead of a
// stack trace from a disconnected client.
//
// Self-registers under the provider name `none`.

import type { AgentRuntimeAdapter } from '../../adapter'
import { CapabilitySet } from '../../capabilities'
import { registerRuntimeFactory, type RuntimeProviderConfig } from '../../registry'
import type { RuntimeAgent, RuntimeConnectionState, RuntimeHealth } from '../../types'

export class NoopRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = 'none'
  readonly capabilities = new CapabilitySet([])

  async isAvailable(): Promise<boolean> {
    return false
  }

  getConnectionState(): RuntimeConnectionState {
    return 'disconnected'
  }

  onConnectionStateChange(_handler: (state: RuntimeConnectionState) => void): () => void {
    return () => {}
  }

  async listAgents(): Promise<RuntimeAgent[]> {
    return []
  }

  async getHealth(): Promise<RuntimeHealth> {
    return { ok: false, agents: 0 }
  }
}

export function createNoopAdapter(): NoopRuntimeAdapter {
  return new NoopRuntimeAdapter()
}

let registered = false

export function ensureNoopFactoryRegistered(): void {
  if (registered) return
  registered = true
  registerRuntimeFactory('none', (_config: RuntimeProviderConfig) => createNoopAdapter())
}

ensureNoopFactoryRegistered()
