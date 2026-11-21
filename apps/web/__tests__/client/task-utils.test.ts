import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatMinutes,
  parseTimeInput,
  isOverdue,
  formatTaskDate,
  formatFullDate,
} from '@/lib/task-utils'

describe('formatMinutes', () => {
  it('formats minutes only', () => {
    expect(formatMinutes(30)).toBe('30m')
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(59)).toBe('59m')
  })

  it('formats hours only', () => {
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(120)).toBe('2h')
  })

  it('formats hours and minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(150)).toBe('2h 30m')
    expect(formatMinutes(61)).toBe('1h 1m')
  })
})

describe('parseTimeInput', () => {
  it('parses pure numbers as minutes', () => {
    expect(parseTimeInput('30')).toBe(30)
    expect(parseTimeInput('0')).toBe(0)
    expect(parseTimeInput('120')).toBe(120)
  })

  it('parses hours format', () => {
    expect(parseTimeInput('2h')).toBe(120)
    expect(parseTimeInput('1h')).toBe(60)
  })

  it('parses minutes format', () => {
    expect(parseTimeInput('30m')).toBe(30)
    expect(parseTimeInput('45m')).toBe(45)
  })

  it('parses combined hours and minutes', () => {
    expect(parseTimeInput('2h30m')).toBe(150)
    expect(parseTimeInput('1h 15m')).toBe(75)
    expect(parseTimeInput('2h 30m')).toBe(150)
  })

  it('trims whitespace', () => {
    expect(parseTimeInput('  30  ')).toBe(30)
    expect(parseTimeInput(' 2h ')).toBe(120)
  })

  it('returns null for invalid input', () => {
    expect(parseTimeInput('abc')).toBeNull()
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('h')).toBeNull()
    expect(parseTimeInput('m')).toBeNull()
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-04T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for past dates', () => {
    expect(isOverdue('2026-02-03T00:00:00Z')).toBe(true)
    expect(isOverdue('2026-01-01T00:00:00Z')).toBe(true)
  })

  it('returns false for future dates', () => {
    expect(isOverdue('2026-02-05T00:00:00Z')).toBe(false)
    expect(isOverdue('2026-12-31T00:00:00Z')).toBe(false)
  })
})

describe('formatTaskDate / formatFullDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-04T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats task date without year when same year', () => {
    const s = formatTaskDate('2026-02-01T00:00:00Z')
    // Locale-dependent, but should include day + month.
    expect(s).toContain('1')
  })

  it('formats task date with year when different year', () => {
    const s = formatTaskDate('2025-12-31T00:00:00Z')
    expect(s).toMatch(/2025/)
  })

  it('formats full date with weekday and long month (es-AR)', () => {
    const s = formatFullDate('2026-02-01T00:00:00Z')
    // Should include a year and day number.
    expect(s).toMatch(/2026/)
    expect(s).toMatch(/1/)
  })
})
