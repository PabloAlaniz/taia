'use client'

import { useEffect, useCallback } from 'react'

// Board shortcuts. Moving or assigning a task with the keyboard needs task
// selection on the board, which doesn't exist yet, so only global actions
// are bound.

interface UseKeyboardShortcutsProps {
  onNewTask: () => void
  onSearch: () => void
  onRefresh: () => void
  onEscape: () => void
}

export function useKeyboardShortcuts({
  onNewTask,
  onSearch,
  onRefresh,
  onEscape,
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
        case '?':
          e.preventDefault()
          showHelp()
          break
      }
    },
    [onNewTask, onSearch, onRefresh, onEscape],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

function showHelp() {
  alert(`⌨️ Atajos de teclado

N - Nueva tarea
/ - Buscar
R - Refrescar
Esc - Cerrar

? - Mostrar esta ayuda`)
}
