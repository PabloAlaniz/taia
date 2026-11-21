'use client'

import { useCallback, useEffect, useEffectEvent, useState } from 'react'

export interface Resource<T> {
  /** Last value loaded for the current key (kept while a reload is in flight). */
  data: T | undefined
  error: string | null
  /** True until the first result for the current key arrives. */
  loading: boolean
  /** Load again without dropping the current data. */
  reload: () => void
}

interface Settled<T> {
  key: string
  data: T | undefined
  error: string | null
}

/**
 * Loads data for `key` and loads it again whenever the key changes; a `null`
 * key loads nothing. Results are stored with the key they belong to, so the
 * loading state is derived instead of reset inside the effect, and a
 * response that arrives after the key changed is dropped.
 */
export function useResource<T>(
  key: string | null,
  load: () => Promise<T>,
  options: {
    /** Load again every `refreshMs` (0 = never); a function derives it from the data. */
    refreshMs?: number | ((data: T | undefined) => number)
    /** Show the previous key's data while the new key loads. */
    keepPreviousData?: boolean
  } = {},
): Resource<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [generation, setGeneration] = useState(0)
  const loadLatest = useEffectEvent(load)

  const current = settled?.key === key ? settled : null
  const shown = current ?? (options.keepPreviousData && key !== null ? settled : null)
  const refreshMs =
    typeof options.refreshMs === 'function'
      ? options.refreshMs(shown?.data)
      : (options.refreshMs ?? 0)

  useEffect(() => {
    if (key === null) return
    let active = true
    const run = () => {
      loadLatest().then(
        (data) => {
          if (active) setSettled({ key, data, error: null })
        },
        (err: unknown) => {
          if (!active) return
          const error = err instanceof Error ? err.message : String(err)
          setSettled((prev) => ({ key, data: prev?.key === key ? prev.data : undefined, error }))
        },
      )
    }
    run()
    const interval = refreshMs > 0 ? setInterval(run, refreshMs) : undefined
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [key, generation, refreshMs])

  const reload = useCallback(() => setGeneration((g) => g + 1), [])

  return {
    data: shown?.data,
    error: current?.error ?? null,
    loading: key !== null && shown === null,
    reload,
  }
}

/** `fetch` that resolves to the JSON body and rejects on a non-2xx status. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}
