'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input, Label, Select } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/molecules/modal'

const AGENT_TYPES = ['cron', 'api', 'human', 'orchestrator'] as const

export function AddAgentModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (agent: Record<string, unknown>) => void
}) {
  const t = useTranslations('agentForm')
  const tc = useTranslations('common')
  const fieldId = useId()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [avatar, setAvatar] = useState('🤖')
  const [type, setType] = useState('cron')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, role, avatar, type }),
      })

      const data = await res.json()
      if (data.ok) {
        onAdd(data.agent)
      } else {
        setError(data.error ? t('createFailedWith', { error: data.error }) : t('createFailed'))
      }
    } catch {
      setError(t('createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} aria-labelledby={`${fieldId}-title`}>
      <ModalHeader>
        <h2 id={`${fieldId}-title`} className="text-lg font-semibold">
          {t('addTitle')}
        </h2>
      </ModalHeader>

      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`${fieldId}-id`} required>
                {t('id')}
              </Label>
              <Input
                id={`${fieldId}-id`}
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder={t('idPlaceholder')}
                aria-describedby={`${fieldId}-id-hint`}
                required
              />
              <p id={`${fieldId}-id-hint`} className="text-2xs text-muted mt-1">
                {t('idHint')}
              </p>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-avatar`}>{t('avatar')}</Label>
              <Input
                id={`${fieldId}-avatar`}
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                aria-describedby={`${fieldId}-avatar-hint`}
              />
              <p id={`${fieldId}-avatar-hint`} className="text-2xs text-muted mt-1">
                {t('avatarHint')}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor={`${fieldId}-name`} required>
              {t('name')}
            </Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              required
            />
          </div>

          <div>
            <Label htmlFor={`${fieldId}-role`}>{t('role')}</Label>
            <Input
              id={`${fieldId}-role`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t('rolePlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor={`${fieldId}-type`}>{t('type')}</Label>
            <Select id={`${fieldId}-type`} value={type} onChange={(e) => setType(e.target.value)}>
              {AGENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`types.${value}`)}
                </option>
              ))}
            </Select>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {busy ? t('creating') : t('create')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
