import { describe, it, expect } from 'vitest'
import { getBackoffDelay } from '@/lib/use-websocket'

describe('getBackoffDelay', () => {
  it('returns base delay on attempt 0', () => {
    expect(getBackoffDelay(0, 3000, 30000)).toBe(3000)
  })

  it('doubles delay on each attempt', () => {
    expect(getBackoffDelay(1, 3000, 30000)).toBe(6000)
    expect(getBackoffDelay(2, 3000, 30000)).toBe(12000)
    expect(getBackoffDelay(3, 3000, 30000)).toBe(24000)
  })

  it('caps at max delay', () => {
    expect(getBackoffDelay(4, 3000, 30000)).toBe(30000)
    expect(getBackoffDelay(10, 3000, 30000)).toBe(30000)
  })

  it('uses default base and max when not provided', () => {
    expect(getBackoffDelay(0)).toBe(3000)
    expect(getBackoffDelay(4)).toBe(30000)
  })

  it('handles custom base and max', () => {
    expect(getBackoffDelay(0, 1000, 5000)).toBe(1000)
    expect(getBackoffDelay(1, 1000, 5000)).toBe(2000)
    expect(getBackoffDelay(2, 1000, 5000)).toBe(4000)
    expect(getBackoffDelay(3, 1000, 5000)).toBe(5000)
  })

  it('returns max when attempt is very large', () => {
    expect(getBackoffDelay(100, 3000, 30000)).toBe(30000)
  })

  it('works with zero attempt and zero base', () => {
    expect(getBackoffDelay(0, 0, 30000)).toBe(0)
  })

  it('caps correctly when base exceeds max', () => {
    expect(getBackoffDelay(0, 50000, 30000)).toBe(30000)
  })
})
