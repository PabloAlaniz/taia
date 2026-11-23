import { describe, expect, it } from 'vitest'
import { generateId } from '../../src/db/pool'

describe('generateId', () => {
  it('is the creation time followed by 64 random bits', () => {
    const before = Date.now()
    const id = generateId()
    const [time, suffix] = id.split('-')

    expect(id).toMatch(/^\d+-[0-9a-f]{16}$/)
    expect(Number(time)).toBeGreaterThanOrEqual(before)
    expect(suffix).toHaveLength(16)
  })

  it('does not repeat within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 10_000 }, generateId))
    expect(ids.size).toBe(10_000)
  })
})
