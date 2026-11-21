// Runtime health — the connection state of every configured runtime
// instance, plus one aggregate state for the board's status indicator.

import type { RuntimeConnectionState } from '@taia/runtime'

import { forEachRuntime } from '../runtime'
import { getDefaultInstanceConfig, listConfiguredInstances } from '../runtime-instances'

export interface InstanceHealth {
  instanceId: string
  provider: string
  label: string
  isDefault: boolean
  state: RuntimeConnectionState
  url?: string
}

/** `degraded`: some instances are connected and some are not. */
export type AggregateRuntimeState = 'connected' | 'connecting' | 'degraded' | 'disconnected'

export interface RuntimeHealth {
  /** True when every instance is connected. */
  ok: boolean
  state: AggregateRuntimeState
  /** False in standalone mode (no instance configured). */
  configured: boolean
  /** Provider of the default instance. */
  provider: string
  instances: InstanceHealth[]
}

function aggregate(states: RuntimeConnectionState[]): AggregateRuntimeState {
  const connected = states.filter((s) => s === 'connected').length
  if (connected === states.length) return 'connected'
  if (connected > 0) return 'degraded'
  if (states.some((s) => s === 'connecting' || s === 'reconnecting')) return 'connecting'
  return 'disconnected'
}

/** Connection state of every configured instance; an instance that fails is disconnected. */
export async function getRuntimeHealth(): Promise<RuntimeHealth> {
  const [instances, defaultConfig, { results }] = await Promise.all([
    listConfiguredInstances(),
    getDefaultInstanceConfig(),
    forEachRuntime(async (adapter) => adapter.getConnectionState()),
  ])
  const stateOf = new Map(results.map((r) => [r.instanceId, r.value]))

  const health: InstanceHealth[] = instances.map((instance) => ({
    instanceId: instance.instanceId,
    provider: instance.provider,
    label: instance.label,
    isDefault: instance.instanceId === defaultConfig.instanceId,
    state: stateOf.get(instance.instanceId) ?? 'disconnected',
    ...(instance.url ? { url: instance.url } : {}),
  }))

  if (health.length === 0) {
    return {
      ok: false,
      state: 'disconnected',
      configured: false,
      provider: defaultConfig.provider,
      instances: [],
    }
  }

  const state = aggregate(health.map((h) => h.state))
  return {
    ok: state === 'connected',
    state,
    configured: true,
    provider: defaultConfig.provider,
    instances: health,
  }
}
