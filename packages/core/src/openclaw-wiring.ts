// OpenClaw wiring — persists each instance's gateway device identity and the
// device token issued after pairing in TAIA settings
// (`runtime.instances.<id>.device_*`), so an approved pairing survives
// restarts. Registers the `openclaw` factory with that store.

import {
  registerOpenClawFactory,
  type OpenClawCredentialStore,
  type OpenClawDeviceIdentity,
  type OpenClawDeviceToken,
} from '@taia/runtime/adapters/openclaw'
import { deleteSetting, getSetting, setSetting } from './db/index'
import { instanceSettingKey } from './runtime-instances'

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await getSetting(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn(`[openclaw-wiring] Ignoring unreadable setting "${key}"`)
    return null
  }
}

export function settingsCredentialStore(instanceId: string): OpenClawCredentialStore {
  const identityKey = instanceSettingKey(instanceId, 'device_identity')
  const tokenKey = (role: string) => instanceSettingKey(instanceId, `device_token.${role}`)
  return {
    loadIdentity: () => readJson<OpenClawDeviceIdentity>(identityKey),
    saveIdentity: (identity) => setSetting(identityKey, JSON.stringify(identity)),
    loadDeviceToken: (role) => readJson<OpenClawDeviceToken>(tokenKey(role)),
    saveDeviceToken: (role, token) => setSetting(tokenKey(role), JSON.stringify(token)),
    clearDeviceToken: async (role) => {
      await deleteSetting(tokenKey(role))
    },
  }
}

registerOpenClawFactory({ credentialStore: settingsCredentialStore })
