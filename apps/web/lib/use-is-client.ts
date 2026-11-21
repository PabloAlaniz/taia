'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False during server rendering and hydration, true afterwards. For UI that
 * cannot match the server markup (DragDropContext ids, the stored theme).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
