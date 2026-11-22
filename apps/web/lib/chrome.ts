'use client'

import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Whether the app chrome (top bar, mobile nav) shows. Full-screen moments
 * such as onboarding hide it while they are mounted.
 */
export const useChromeStore = create<{ hidden: number; hide: () => () => void }>((set) => ({
  hidden: 0,
  hide: () => {
    set((s) => ({ hidden: s.hidden + 1 }))
    return () => set((s) => ({ hidden: Math.max(0, s.hidden - 1) }))
  },
}))

/** Hide the app chrome while the calling component is mounted and `when` holds. */
export function useHideChrome(when = true) {
  const hide = useChromeStore((s) => s.hide)
  useEffect(() => (when ? hide() : undefined), [when, hide])
}
