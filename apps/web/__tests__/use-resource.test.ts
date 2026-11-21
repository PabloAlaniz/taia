// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useResource } from '@/lib/use-resource'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useResource', () => {
  it('loads the data for the key', async () => {
    const { result } = renderHook(() => useResource('a', async () => 'A'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe('A'))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('loads nothing for a null key', () => {
    const load = vi.fn(async () => 'A')
    const { result } = renderHook(() => useResource(null, load))
    expect(load).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('drops a response that arrives after the key changed', async () => {
    const first = deferred<string>()
    const { result, rerender } = renderHook(
      ({ key }) => useResource(key, () => (key === 'a' ? first.promise : Promise.resolve('B'))),
      { initialProps: { key: 'a' } },
    )
    rerender({ key: 'b' })
    await waitFor(() => expect(result.current.data).toBe('B'))
    await act(async () => first.resolve('A'))
    expect(result.current.data).toBe('B')
  })

  it('is loading again with no data when the key changes', async () => {
    const { result, rerender } = renderHook(({ key }) => useResource(key, async () => key), {
      initialProps: { key: 'a' },
    })
    await waitFor(() => expect(result.current.data).toBe('a'))
    rerender({ key: 'b' })
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('can keep the previous data while a new key loads', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => useResource(key, async () => key, { keepPreviousData: true }),
      { initialProps: { key: 'a' } },
    )
    await waitFor(() => expect(result.current.data).toBe('a'))
    rerender({ key: 'b' })
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe('a')
    await waitFor(() => expect(result.current.data).toBe('b'))
  })

  it('keeps the data while reloading and reports errors', async () => {
    let calls = 0
    const { result } = renderHook(() =>
      useResource('a', async () => {
        calls++
        if (calls > 1) throw new Error('down')
        return 'A'
      }),
    )
    await waitFor(() => expect(result.current.data).toBe('A'))
    act(() => result.current.reload())
    expect(result.current.loading).toBe(false)
    await waitFor(() => expect(result.current.error).toBe('down'))
    expect(result.current.data).toBe('A')
  })
})
