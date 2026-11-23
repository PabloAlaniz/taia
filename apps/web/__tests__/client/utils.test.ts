import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn, formatRelativeTime, timeUntil } from '@/lib/utils'

describe('cn (className merge)', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('merges tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-04T20:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for very recent times', () => {
    const result = formatRelativeTime('2026-02-04T19:59:30Z')
    expect(result).toBe('just now')
  })

  it('returns minutes ago', () => {
    const result = formatRelativeTime('2026-02-04T19:30:00Z')
    expect(result).toBe('30m ago')
  })

  it('returns hours ago', () => {
    const result = formatRelativeTime('2026-02-04T17:00:00Z')
    expect(result).toBe('3h ago')
  })

  it('returns days ago', () => {
    const result = formatRelativeTime('2026-02-02T20:00:00Z')
    expect(result).toBe('2d ago')
  })

  it('handles ISO strings without timezone', () => {
    const result = formatRelativeTime('2026-02-04 19:00:00')
    expect(result).toBe('1h ago')
  })

  it('handles ISO strings with space instead of T', () => {
    const result = formatRelativeTime('2026-02-04 18:00:00')
    expect(result).toBe('2h ago')
  })
})

describe('timeUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-04T20:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns now when date is in the past', () => {
    expect(timeUntil('2026-02-04T19:00:00Z')).toBe('now')
  })

  it('returns minutes when under 60 minutes', () => {
    expect(timeUntil('2026-02-04T20:20:00Z')).toBe('in 20m')
  })

  it('returns hours when 60 minutes or more', () => {
    expect(timeUntil('2026-02-04T23:00:00Z')).toBe('in 3h')
  })
})
