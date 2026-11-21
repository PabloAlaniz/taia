// Runtime registry — polymorphic factory keyed by provider name.
// Adapters self-register their factory at module import time; the host
// builds one adapter per runtime instance it runs.

import type { AgentRuntimeAdapter } from './adapter'
import { RuntimeNotConfiguredError } from './errors'

export type RuntimeProviderName = 'openclaw' | 'claude-code' | 'cursor' | 'aider' | string

export interface RuntimeProviderConfig {
  provider: RuntimeProviderName
  url?: string
  token?: string
  /**
   * The host's name for this runtime instance. Adapters that keep state on
   * the host (credentials, sessions) scope it by instance; defaults to the
   * provider name.
   */
  instanceId?: string
  /** Public URL of TAIA, for agents that reach the board over HTTP. Set by the host. */
  taiaBaseUrl?: string
  [key: string]: unknown
}

export type RuntimeAdapterFactory = (config: RuntimeProviderConfig) => AgentRuntimeAdapter

const factories = new Map<RuntimeProviderName, RuntimeAdapterFactory>()

export function registerRuntimeFactory(
  provider: RuntimeProviderName,
  fn: RuntimeAdapterFactory,
): void {
  factories.set(provider, fn)
}

export function unregisterRuntimeFactory(provider: RuntimeProviderName): void {
  factories.delete(provider)
}

export function listRegisteredProviders(): RuntimeProviderName[] {
  return Array.from(factories.keys())
}

/** The instance id of an adapter config: `instanceId`, else the provider name. */
export function instanceIdOf(config: RuntimeProviderConfig): string {
  return config.instanceId || config.provider
}

export function createRuntimeAdapter(config: RuntimeProviderConfig): AgentRuntimeAdapter {
  const fn = factories.get(config.provider)
  if (!fn) {
    const known = listRegisteredProviders().join(', ') || '(none)'
    throw new RuntimeNotConfiguredError(
      `No runtime factory registered for provider "${config.provider}". Known providers: ${known}.`,
    )
  }
  return fn(config)
}
