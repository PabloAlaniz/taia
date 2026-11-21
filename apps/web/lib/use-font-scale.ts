'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'taia-ui-scale'
const DEFAULT_SCALE = 1.1
const MIN_SCALE = 0.8
const MAX_SCALE = 1.5
const STEP = 0.1

// The stored scale is the source of truth; this hook only notifies same-tab
// subscribers (the `storage` event covers other tabs).
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function readScale(): number {
  const saved = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '')
  return !isNaN(saved) && saved >= MIN_SCALE && saved <= MAX_SCALE ? saved : DEFAULT_SCALE
}

export function useFontScale() {
  const scale = useSyncExternalStore(subscribe, readScale, () => DEFAULT_SCALE)

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(scale))
  }, [scale])

  const updateScale = useCallback((newScale: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(newScale * 10) / 10))
    localStorage.setItem(STORAGE_KEY, String(clamped))
    listeners.forEach((listener) => listener())
  }, [])

  const increase = useCallback(() => {
    updateScale(scale + STEP)
  }, [scale, updateScale])

  const decrease = useCallback(() => {
    updateScale(scale - STEP)
  }, [scale, updateScale])

  const reset = useCallback(() => {
    updateScale(DEFAULT_SCALE)
  }, [updateScale])

  return {
    scale,
    increase,
    decrease,
    reset,
    canIncrease: scale < MAX_SCALE,
    canDecrease: scale > MIN_SCALE,
  }
}
