import { describe, expect, it } from 'vitest'
import {
  generateAccessToken,
  hashTokenSecret,
  maskedToken,
  parseAccessToken,
  secretMatches,
} from '@taia/core/access/token-format'

describe('access token format', () => {
  it('generates taia_<id>_<secret> and the hash of its secret', () => {
    const { token, id, hash } = generateAccessToken()
    expect(token).toMatch(/^taia_[a-z2-7]{8}_[A-Za-z0-9_-]{43}$/)
    const parsed = parseAccessToken(token)
    expect(parsed?.id).toBe(id)
    expect(hash).toBe(hashTokenSecret(parsed!.secret))
    expect(hash).not.toContain(parsed!.secret)
  })

  it('never repeats ids or secrets', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateAccessToken().token))
    expect(tokens.size).toBe(200)
  })

  it.each([
    '',
    'not-a-token',
    'taia_short_x',
    `taia_ABCDEFGH_${'a'.repeat(43)}`,
    `taia_abcdefgh_${'a'.repeat(42)}`,
  ])('rejects %j', (value) => {
    expect(parseAccessToken(value)).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    const { token, id } = generateAccessToken()
    expect(parseAccessToken(`  ${token}\n`)?.id).toBe(id)
  })

  it('matches a secret only against its own hash', () => {
    const a = parseAccessToken(generateAccessToken().token)!
    const b = generateAccessToken()
    expect(secretMatches(a.secret, hashTokenSecret(a.secret))).toBe(true)
    expect(secretMatches(a.secret, b.hash)).toBe(false)
    expect(secretMatches(a.secret, 'not-hex')).toBe(false)
  })

  it('masks a token to its public id', () => {
    expect(maskedToken('abcdefgh')).toBe('taia_abcdefgh_…')
  })
})
