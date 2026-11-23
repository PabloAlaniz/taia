'use client'

import { useEffect, useCallback } from 'react'

// Board shortcuts: global actions plus triage of what waits on a person.

interface UseKeyboardShortcutsProps {
  onNewTask: () => void
  onSearch: () => void
  onRefresh: () => void
  onEscape: () => void
  onHelp: () => void
  onNextWaiting: () => void
  onToggleWaiting: () => void
}

export function useKeyboardShortcuts({
  onNewTask,
  onSearch,
  onRefresh,
  onEscape,
  onHelp,
  onNextWaiting,
  onToggleWaiting,
}: UseKeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if (e.key === 'Escape') {
          ;(e.target as HTMLElement).blur()
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault()
          onNewTask()
          break
        case '/':
          e.preventDefault()
          onSearch()
          break
        case 'r':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onRefresh()
          }
          break
        case 'escape':
          onEscape()
          break
        case 'w':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onNextWaiting()
          }
          break
        case 't':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onToggleWaiting()
          }
          break
        case '?':
          e.preventDefault()
          onHelp()
          break
      }
    },
    [onNewTask, onSearch, onRefresh, onEscape, onHelp, onNextWaiting, onToggleWaiting],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/** Focus the title link of the next strip that waits on a person, wrapping around. */
export function focusNextWaitingStrip(): boolean {
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-waiting="true"] a[data-strip-link]'),
  )
  if (links.length === 0) return false
  const current = links.findIndex((l) => l === document.activeElement)
  const next = links[(current + 1) % links.length]
  next.focus()
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return true
}
