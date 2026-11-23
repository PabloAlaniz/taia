'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input, Select } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/molecules/modal'
import { FormField } from './fields'
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
  const nameRef = useRef<HTMLInputElement>(null)
  const isPerson = agent.type === 'human'
  const [name, setName] = useState(agent.name)
  // People saved before roles were optional carry the agent fallback "Agent".
  const [role, setRole] = useState(isPerson && agent.role === 'Agent' ? '' : agent.role || '')
  const [type, setType] = useState(agent.type)
  const [nameError, setNameError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) {
      setNameError(t('errors.nameRequired'))
      nameRef.current?.focus()
      return
    }
    setBusy(true)

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role, type }),
      })

      if (res.ok) {
        onSave()
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setFormError(data.error ? t('saveFailedWith', { error: data.error }) : t('saveFailed'))
      }
    } catch {
      setFormError(t('saveFailed'))
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
        <code className="font-mono text-xs text-muted">{agent.id}</code>
      </ModalHeader>

      <form onSubmit={handleSubmit} noValidate>
        <ModalBody className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

          <FormField id={`${fieldId}-name`} label={t('name')} error={nameError}>
            {(control) => (
              <Input
                {...control}
                ref={nameRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError('')
                }}
                placeholder={isPerson ? t('personNamePlaceholder') : t('namePlaceholder')}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField id={`${fieldId}-role`} label={t('role')}>
            {(control) => (
              <Input
                {...control}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={isPerson ? t('personRolePlaceholder') : t('rolePlaceholder')}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField id={`${fieldId}-type`} label={t('type')}>
            {({ id: selectId }) => (
              <Select id={selectId} value={type} onChange={(e) => setType(e.target.value)}>
                {AGENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`types.${value}`)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
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
