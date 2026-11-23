'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input, Select } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/molecules/modal'
import { FormField, cleanId, idProblem, slugify } from './fields'

// People have their own form (AddPersonModal); this one adds agents only.
const AGENT_TYPES = ['cron', 'api', 'orchestrator'] as const

type Errors = { name?: string; id?: string }

export function AddAgentModal({
  takenIds = [],
  onClose,
  onAdd,
}: {
  /** Ids already in use, so a clash is caught before the request. */
  takenIds?: readonly string[]
  onClose: () => void
  onAdd: (agent: Record<string, unknown>) => void
}) {
  const t = useTranslations('agentForm')
  const tc = useTranslations('common')
  const fieldId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const idRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  // Until the user edits the id, it follows the name.
  const [customId, setCustomId] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [type, setType] = useState<string>('cron')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const id = customId ?? slugify(name)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const next: Errors = {}
    if (!name.trim()) next.name = t('errors.nameRequired')
    const problem = idProblem(id, takenIds)
    if (problem) next.id = t(`errors.${problem}`, { id })
    setErrors(next)
    if (next.name) return nameRef.current?.focus()
    if (next.id) return idRef.current?.focus()

    setBusy(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: name.trim(), role: role.trim() || undefined, type }),
      })

      const data = await res.json()
      if (data.ok) {
        onAdd(data.agent)
      } else {
        setFormError(
          data.error ? t('createFailedWith', { error: String(data.error) }) : t('createFailed'),
        )
      }
    } catch {
      setFormError(t('createFailed'))
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

      <form onSubmit={handleSubmit} noValidate>
        <ModalBody className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

          <FormField id={`${fieldId}-name`} label={t('name')} error={errors.name}>
            {(control) => (
              <Input
                {...control}
                ref={nameRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  // A derived id changes with the name, so its error goes too.
                  setErrors((prev) => ({ id: customId === null ? undefined : prev.id }))
                }}
                placeholder={t('namePlaceholder')}
                autoComplete="off"
                autoFocus
              />
            )}
          </FormField>

          <FormField id={`${fieldId}-id`} label={t('id')} hint={t('idHint')} error={errors.id}>
            {(control) => (
              <Input
                {...control}
                ref={idRef}
                variant="mono"
                value={id}
                onChange={(e) => {
                  setCustomId(cleanId(e.target.value))
                  if (errors.id) setErrors((prev) => ({ ...prev, id: undefined }))
                }}
                placeholder={t('idPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </FormField>

          <FormField id={`${fieldId}-role`} label={t('role')}>
            {(control) => (
              <Input
                {...control}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={t('rolePlaceholder')}
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
            {busy ? t('creating') : t('create')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
