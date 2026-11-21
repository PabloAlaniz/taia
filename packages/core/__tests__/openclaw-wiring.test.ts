import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = new Map<string, string>()

vi.mock('@taia/core/db', () => ({
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => {
    settings.set(key, value)
  },
  deleteSetting: async (key: string) => settings.delete(key),
}))

import { settingsCredentialStore } from '@taia/core/openclaw-wiring'

const store = settingsCredentialStore('gw-1')

beforeEach(() => settings.clear())

describe('settingsCredentialStore', () => {
  it('round-trips the device identity', async () => {
    expect(await store.loadIdentity()).toBeNull()
    const identity = { deviceId: 'd', publicKeyPem: 'pub', privateKeyPem: 'priv' }
    await store.saveIdentity(identity)
    expect(await store.loadIdentity()).toEqual(identity)
    expect(settings.has('runtime.instances.gw-1.device_identity')).toBe(true)
  })

  it('stores device tokens per role and clears them', async () => {
    await store.saveDeviceToken('operator', { token: 't', scopes: ['operator.read'] })
    expect(await store.loadDeviceToken('operator')).toEqual({
      token: 't',
      scopes: ['operator.read'],
    })
    expect(await store.loadDeviceToken('node')).toBeNull()
    await store.clearDeviceToken('operator')
    expect(await store.loadDeviceToken('operator')).toBeNull()
  })

  it('keeps each instance paired on its own', async () => {
    await store.saveIdentity({ deviceId: 'd', publicKeyPem: 'pub', privateKeyPem: 'priv' })
    expect(await settingsCredentialStore('gw-2').loadIdentity()).toBeNull()
  })

  it('ignores unreadable JSON', async () => {
    settings.set('runtime.instances.gw-1.device_identity', '{not json')
    expect(await store.loadIdentity()).toBeNull()
  })
})
