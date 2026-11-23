'use client'

import { useTranslations } from 'next-intl'
import { Button, Kbd } from '../atoms'
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../molecules/modal'

const KEYS = [
  ['N', 'newTask'],
  ['/', 'search'],
  ['W', 'nextWaiting'],
  ['T', 'toggleWaiting'],
  ['R', 'refresh'],
  ['?', 'help'],
] as const

/** The board's keyboard shortcuts, in the app's own dialog. */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('shortcuts')
  return (
    <Modal open={open} onClose={onClose} size="md" aria-labelledby="shortcuts-title">
      <ModalHeader>
        <h2 id="shortcuts-title" className="text-base font-semibold">
          {t('title')}
        </h2>
      </ModalHeader>
      <ModalBody>
        <dl className="divide-y divide-border">
          {KEYS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-sm">{t(label)}</dt>
              <dd>
                <Kbd>{key}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted mt-3 text-pretty">{t('taskPage')}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('close')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
