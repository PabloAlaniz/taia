'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../organisms/modal'
import { Button, Input } from '../atoms'

interface WipLimitModalProps {
  open: boolean
  status: string | null
  columnLabel?: string
  currentLimit: number | null
  onClose: () => void
  onSave: (status: string, limit: number | null) => void
}

export function WipLimitModal({
  open,
  status,
  columnLabel,
  currentLimit,
  onClose,
  onSave,
}: WipLimitModalProps) {
  const t = useTranslations('wipLimit')
  const tc = useTranslations('common')
  // `null` while the input shows the current limit; cleared on close.
  const [draft, setDraft] = useState<string | null>(null)
  const limit = draft ?? (currentLimit != null ? String(currentLimit) : '')

  const close = () => {
    setDraft(null)
    onClose()
  }

  const handleSave = () => {
    if (!status) return
    const numLimit = limit.trim() === '' ? null : parseInt(limit, 10)
    if (numLimit !== null && (isNaN(numLimit) || numLimit < 1)) {
      return // Invalid input
    }
    onSave(status, numLimit)
    close()
  }

  const handleRemoveLimit = () => {
    if (!status) return
    onSave(status, null)
    close()
  }

  if (!status) return null

  return (
    <Modal open={open} onClose={close} size="sm" aria-labelledby="wip-limit-title">
      <ModalHeader>
        <h2 id="wip-limit-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted mt-1">{columnLabel || status}</p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div>
            <label htmlFor="wip-limit-input" className="block text-sm font-medium mb-2">
              {t('maxTasks')}
            </label>
            <Input
              id="wip-limit-input"
              type="number"
              min="1"
              value={limit}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('noLimit')}
              className="focus:ring-2 focus:ring-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') close()
              }}
            />
            <p className="text-xs text-muted mt-2">{t('helpText')}</p>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        {currentLimit != null && (
          <Button variant="ghost" onClick={handleRemoveLimit}>
            {t('removeLimit')}
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="secondary" onClick={close}>
          {tc('cancel')}
        </Button>
        <Button onClick={handleSave}>{tc('save')}</Button>
      </ModalFooter>
    </Modal>
  )
}
