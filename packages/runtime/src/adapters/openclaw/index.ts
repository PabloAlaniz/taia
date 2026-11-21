// Public surface for the OpenClaw adapter — registers itself as the factory
// for the `openclaw` provider and exposes convenience constructors.

import { instanceIdOf, registerRuntimeFactory, type RuntimeProviderConfig } from '../../registry'
import { createOpenClawAdapter, OpenClawAdapter } from './adapter'
import type { OpenClawCredentialStore } from './types'

export { OpenClawAdapter, createOpenClawAdapter } from './adapter'
export type { OpenClawAdapterOptions } from './adapter'
export {
  OpenClawClient,
  OpenClawGatewayError,
  OpenClawPairingRequiredError,
  OpenClawFileConflictError,
  OpenClawConfigConflictError,
  generateDeviceIdentity,
} from './client'
export type { OpenClawClientOptions, GatewayConfigResult } from './client'
export type { OpenClawCredentialStore, OpenClawDeviceIdentity, OpenClawDeviceToken } from './types'

export interface OpenClawProviderWiring {
  /**
   * Host-provided persistence for the paired device identity and token, per
   * runtime instance: each gateway pairs its own device.
   */
  credentialStore?: (instanceId: string) => OpenClawCredentialStore
}

/**
 * Register the `openclaw` factory. Called with no wiring at import time;
 * hosts call it again with a credential store to keep pairing across restarts.
 */
export function registerOpenClawFactory(wiring: OpenClawProviderWiring = {}): void {
  registerRuntimeFactory('openclaw', (config: RuntimeProviderConfig): OpenClawAdapter => {
    if (!config.url) {
      throw new Error('OpenClaw provider config requires a url')
    }
    return createOpenClawAdapter({
      url: config.url,
      token: config.token,
      credentialStore: wiring.credentialStore?.(instanceIdOf(config)),
      taiaBaseUrl: config.taiaBaseUrl,
      contextSync: config.contextSync === 'pull' ? 'pull' : 'push',
    })
  })
}

registerOpenClawFactory()
