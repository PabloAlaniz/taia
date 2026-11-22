'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input, Label, Select } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/molecules/modal'
import type { SquadMember } from './types'

const AGENT_TYPES = ['cron', 'api', 'human', 'orchestrator'] as const

export function EditAgentModal({
  agent,
  onClose,
  onSave,
}: {
  agent: SquadMember
  onClose: () => void
  onSave: () => void
}) {
  const t = useTranslations('agentForm')
  const tc = useTranslations('common')
  const fieldId = useId()
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState(agent.role || '')
  const [avatar, setAvatar] = useState(agent.avatar || '🤖')
  const [type, setType] = useState(agent.type)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, avatar, type }),
      })

      if (res.ok) {
        onSave()
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? t('saveFailedWith', { error: data.error }) : t('saveFailed'))
      }
    } catch {
      setError(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} aria-labelledby={`${fieldId}-title`}>
      <ModalHeader>
        <h2 id={`${fieldId}-title`} className="text-lg font-semibold">
          {t('editTitle', { name: agent.name })}
        </h2>
        <code className="text-xs text-muted">{agent.id}</code>
      </ModalHeader>

      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`${fieldId}-name`}>{t('name')}</Label>
              <Input
                id={`${fieldId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-avatar`}>{t('avatar')}</Label>
              <Input
                id={`${fieldId}-avatar`}
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`${fieldId}-role`}>{t('role')}</Label>
            <Input id={`${fieldId}-role`} value={role} onChange={(e) => setRole(e.target.value)} />
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
            {busy ? t('saving') : t('save')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
