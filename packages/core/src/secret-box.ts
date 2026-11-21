// Encryption at rest for secrets kept in the `settings` table (runtime tokens,
// API keys, device identities, webhook secrets).
//
// The key comes from `TAIA_SECRET_KEY` in the server environment, never from
// the database: a dump or a read-only connection to PostgreSQL then yields
// ciphertext only. Without the variable, secrets are stored as plain text, as
// before.
//
// Format: `enc:v1:<base64url(iv | auth tag | ciphertext)>`, AES-256-GCM. The
// setting key is authenticated with the value, so a ciphertext copied to
// another row doesn't decrypt.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const PREFIX = 'enc:v1:'
const IV_BYTES = 12
const TAG_BYTES = 16
const MIN_KEY_LENGTH = 16
// Fixed on purpose: the same TAIA_SECRET_KEY must derive the same key in every
// process. The entropy has to come from the variable itself.
const KDF_SALT = 'taia-settings-v1'

const SENSITIVE_PARTS = [
  'token',
  'api_key',
  'apikey',
  'private_key',
  'device_identity',
  'secret',
  'password',
]
// The list of outgoing webhook endpoints carries each endpoint's signing secret.
const OUTGOING_ENDPOINTS_KEY = /^webhooks\.outgoing\..+\.endpoints$/

/** Settings whose value is a credential: masked by the API and encrypted at rest. */
export function isSensitiveSettingKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return (
    SENSITIVE_PARTS.some((part) => normalized.includes(part)) ||
    OUTGOING_ENDPOINTS_KEY.test(normalized)
  )
}

export class SecretKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretKeyError'
  }
}

let derived: { passphrase: string; key: Buffer } | null = null

function encryptionKey(): Buffer | null {
  const passphrase = process.env.TAIA_SECRET_KEY
  if (!passphrase) return null
  if (passphrase.length < MIN_KEY_LENGTH) {
    throw new SecretKeyError(
      `TAIA_SECRET_KEY must have at least ${MIN_KEY_LENGTH} characters (try: openssl rand -base64 32)`,
    )
  }
  if (derived?.passphrase !== passphrase) {
    derived = { passphrase, key: scryptSync(passphrase, KDF_SALT, 32) }
  }
  return derived.key
}

export function secretEncryptionEnabled(): boolean {
  return encryptionKey() !== null
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}

/** Encrypts `value` for the setting `settingKey`; returns it unchanged without a key. */
export function sealSecret(settingKey: string, value: string): string {
  const key = encryptionKey()
  if (!key || value === '' || isEncrypted(value)) return value

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(settingKey, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

/** Decrypts a stored value; plain text (stored before a key was set) passes through. */
export function openSecret(settingKey: string, stored: string): string {
  if (!isEncrypted(stored)) return stored

  const key = encryptionKey()
  if (!key) {
    throw new SecretKeyError(
      `Setting ${settingKey} is encrypted but TAIA_SECRET_KEY is not set on this server`,
    )
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(settingKey, 'utf8'))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  try {
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new SecretKeyError(
      `Setting ${settingKey} could not be decrypted: TAIA_SECRET_KEY is not the key it was saved with`,
    )
  }
}
