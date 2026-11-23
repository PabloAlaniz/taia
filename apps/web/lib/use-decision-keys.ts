'use client'

import { useEffect } from 'react'

/**
 * A approves and X rejects the approval in front of you: the one on the
 * focused strip, or, on a task page, the one in its waiting band. Both go
 * through the same buttons (and the same undo window) as a click.
 */
export function useDecisionKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const key = e.key.toLowerCase()
      if (key !== 'a' && key !== 'x') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        return
      }
      if (document.querySelector('[role="dialog"]')) return
      const scope =
        target?.closest<HTMLElement>('[data-strip]') ??
        document.querySelector<HTMLElement>('[data-waiting-band]')
      const button = scope?.querySelector<HTMLButtonElement>(
        `button[data-decide="${key === 'a' ? 'approve' : 'reject'}"]`,
      )
      if (!button || button.disabled) return
      e.preventDefault()
      button.focus()
      button.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
