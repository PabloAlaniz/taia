// Format of the access tokens stored in api_tokens (migration 0009).
//
//   taia_<id>_<secret>
//
// `id` is 8 lowercase base32 characters, public: it finds the row and is
// what the UI shows. `secret` is 32 random bytes in base64url (43 chars).
// The `taia_` prefix lets secret scanners recognise a leaked token.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_PREFIX = 'taia_'
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const ID_LENGTH = 8
const SECRET_BYTES = 32
const TOKEN_PATTERN = /^taia_([a-z2-7]{8})_([A-Za-z0-9_-]{43})$/

export interface ParsedToken {
  id: string
  secret: string
}

function randomId(): string {
  const bytes = randomBytes(ID_LENGTH)
  let id = ''
  for (const byte of bytes) id += ID_ALPHABET[byte & 31]
  return id
}

/** A new token: the full value to hand out once, its id and the hash to store. */
export function generateAccessToken(): { token: string; id: string; hash: string } {
  const id = randomId()
  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  return { token: `${TOKEN_PREFIX}${id}_${secret}`, id, hash: hashTokenSecret(secret) }
}

/** The id and secret of a well-formed token, or null. */
export function parseAccessToken(value: string): ParsedToken | null {
  const match = TOKEN_PATTERN.exec(value.trim())
  return match ? { id: match[1], secret: match[2] } : null
}

export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** Whether `secret` hashes to `hash`, in constant time. */
export function secretMatches(secret: string, hash: string): boolean {
  const presented = Buffer.from(hashTokenSecret(secret), 'hex')
  const stored = Buffer.from(hash, 'hex')
  return presented.length === stored.length && timingSafeEqual(presented, stored)
}

/** What the UI shows instead of the token: `taia_<id>_…`. */
export function maskedToken(id: string): string {
  return `${TOKEN_PREFIX}${id}_…`
}
