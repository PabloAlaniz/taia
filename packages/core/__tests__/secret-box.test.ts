import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isEncrypted,
  isSensitiveSettingKey,
  openSecret,
  sealSecret,
  secretEncryptionEnabled,
  SecretKeyError,
} from '@taia/core/secret-box'

const KEY = 'runtime.instances.default.token'

beforeEach(() => {
  process.env.TAIA_SECRET_KEY = 'a-test-key-that-is-long-enough'
})

afterEach(() => {
  delete process.env.TAIA_SECRET_KEY
})

describe('isSensitiveSettingKey', () => {
  it.each([
    'openclaw.gateway_token',
    'runtime.instances.default.api_key',
    'runtime.instances.gw.device_identity',
    'runtime.instances.gw.device_token.operator',
    'webhooks.incoming.ws-default.secret',
    'webhooks.outgoing.ws-default.endpoints',
    'smtp.PASSWORD',
  ])('%s is sensitive', (key) => {
    expect(isSensitiveSettingKey(key)).toBe(true)
  })

  it.each(['ui.theme', 'worktree.base_path', 'webhooks.outgoing.ws-default.deliveries'])(
    '%s is not sensitive',
    (key) => {
      expect(isSensitiveSettingKey(key)).toBe(false)
    },
  )
})

describe('sealSecret / openSecret', () => {
  it('round-trips a value and never stores it in the clear', () => {
    const sealed = sealSecret(KEY, 'sk-ant-very-secret')

    expect(isEncrypted(sealed)).toBe(true)
    expect(sealed).not.toContain('sk-ant-very-secret')
    expect(openSecret(KEY, sealed)).toBe('sk-ant-very-secret')
  })

  it('produces a different ciphertext every time', () => {
    expect(sealSecret(KEY, 'same')).not.toBe(sealSecret(KEY, 'same'))
  })

  it('does not encrypt twice', () => {
    const sealed = sealSecret(KEY, 'value')
    expect(sealSecret(KEY, sealed)).toBe(sealed)
  })

  it('leaves empty values alone', () => {
    expect(sealSecret(KEY, '')).toBe('')
  })

  it('reads values stored as plain text before the key was set', () => {
    expect(openSecret(KEY, 'legacy-plain-token')).toBe('legacy-plain-token')
  })

  it('refuses a ciphertext moved to another setting', () => {
    const sealed = sealSecret(KEY, 'value')
    expect(() => openSecret('runtime.instances.other.token', sealed)).toThrow(SecretKeyError)
  })

  it('refuses a tampered ciphertext', () => {
    const sealed = sealSecret(KEY, 'value')
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA')
    expect(() => openSecret(KEY, tampered)).toThrow(SecretKeyError)
  })

  it('refuses to decrypt with a different key', () => {
    const sealed = sealSecret(KEY, 'value')
    process.env.TAIA_SECRET_KEY = 'another-key-also-long-enough'
    expect(() => openSecret(KEY, sealed)).toThrow(/not the key it was saved with/)
  })

  it('says so when an encrypted value is read without a key', () => {
    const sealed = sealSecret(KEY, 'value')
    delete process.env.TAIA_SECRET_KEY
    expect(() => openSecret(KEY, sealed)).toThrow(/TAIA_SECRET_KEY is not set/)
  })

  it('stores plain text when no key is configured', () => {
    delete process.env.TAIA_SECRET_KEY
    expect(secretEncryptionEnabled()).toBe(false)
    expect(sealSecret(KEY, 'value')).toBe('value')
  })

  it('rejects a key that is too short', () => {
    process.env.TAIA_SECRET_KEY = 'short'
    expect(() => sealSecret(KEY, 'value')).toThrow(/at least 16 characters/)
  })
})
