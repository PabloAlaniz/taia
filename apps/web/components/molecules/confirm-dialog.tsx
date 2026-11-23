'use client'

import { Button } from '../atoms'
import { Modal, ModalBody, ModalFooter, ModalHeader } from './modal'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  body: React.ReactNode
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** The app's own confirmation: names what happens, never a native confirm(). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => !busy && onCancel()}
      size="md"
      aria-labelledby="confirm-title"
    >
      <ModalHeader>
        <h2 id="confirm-title" className="text-base font-semibold">
          {title}
        </h2>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <div className="text-sm leading-relaxed">{body}</div>
        {error && (
          <p role="alert" className="text-sm text-alert">
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          size="sm"
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
