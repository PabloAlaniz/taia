'use client'

import { useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { Backdrop } from '../atoms'

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  'aria-label'?: string
  'aria-labelledby'?: string
}

const sizes = {
  sm: 'w-[300px] max-w-[calc(100vw-2rem)]',
  md: 'w-[400px] max-w-[calc(100vw-2rem)]',
  lg: 'w-[600px] max-w-[calc(100vw-2rem)]',
  xl: 'w-[90vw] h-[85vh]',
  full: 'w-full max-w-2xl max-h-[90vh]',
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The dialog owns this Escape: the page underneath must not also act
        // on it (the task page would otherwise leave for the board).
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // Focus trap: cycle Tab within modal
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)

    // Focus first focusable element, or the dialog itself
    const el = dialogRef.current
    if (el) {
      const firstFocusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (firstFocusable) {
        firstFocusable.focus()
      } else {
        el.focus()
      }
    }

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <Backdrop align="center" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-card rounded-lg border border-border max-h-[90vh] overflow-hidden flex flex-col focus:outline-hidden',
          sizes[size],
        )}
      >
        {children}
      </div>
    </Backdrop>
  )
}

export function ModalHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('p-4 border-b border-border shrink-0', className)}>{children}</div>
}

export function ModalBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('p-4 overflow-y-auto flex-1', className)}>{children}</div>
}

export function ModalFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('p-4 border-t border-border flex justify-end gap-3 shrink-0', className)}>
      {children}
    </div>
  )
}
