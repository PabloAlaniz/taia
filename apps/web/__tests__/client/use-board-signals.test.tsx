// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const decide = vi.fn()
const decideOnLeave = vi.fn()
vi.mock('@/lib/api', () => ({
  api: {
    cost: { forTasks: vi.fn().mockResolvedValue({ ok: true, costs: {} }) },
    approvals: {
      decide: (...args: unknown[]) => decide(...args),
      decideOnLeave: (...args: unknown[]) => decideOnLeave(...args),
    },
  },
}))

import { UNDO_MS, useBoardSignals } from '@/lib/use-board-signals'

beforeEach(() => {
  vi.useFakeTimers()
  decide.mockReset().mockResolvedValue({ ok: true })
  decideOnLeave.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBoardSignals: undoable decisions', () => {
  it('sends a queued approval only after the undo window, with who decided', async () => {
    const { result } = renderHook(() => useBoardSignals([]))

    act(() => result.current.queueDecision('ap-1', 'approved', 'person-1'))
    expect(result.current.pending['ap-1']?.decision).toBe('approved')
    expect(decide).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS)
    })
    expect(decide).toHaveBeenCalledWith('ap-1', 'approved', 'person-1')
    expect(result.current.pending['ap-1']).toBeUndefined()
  })

  it('never sends a decision that was undone', async () => {
    const { result } = renderHook(() => useBoardSignals([]))

    act(() => result.current.queueDecision('ap-1', 'rejected', 'person-1'))
    act(() => result.current.undoDecision('ap-1'))
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS * 2)
    })

    expect(decide).not.toHaveBeenCalled()
    expect(result.current.pending['ap-1']).toBeUndefined()
  })

  it('sends what was queued when the board unmounts', () => {
    const { result, unmount } = renderHook(() => useBoardSignals([]))

    act(() => result.current.queueDecision('ap-1', 'approved', 'person-1'))
    unmount()

    expect(decide).toHaveBeenCalledWith('ap-1', 'approved', 'person-1')
  })
})

describe('useBoardSignals: closing the tab', () => {
  it('sends each queued decision with a keepalive request on pagehide', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useBoardSignals([]))

    act(() => result.current.queueDecision('ap-1', 'approved', 'person-1'))
    window.dispatchEvent(new Event('pagehide'))

    expect(decideOnLeave).toHaveBeenCalledWith('ap-1', 'approved', 'person-1')
    // The timer is cleared: nothing is sent twice when the window would end.
    vi.advanceTimersByTime(UNDO_MS)
    expect(decide).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
