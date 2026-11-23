'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/molecules/modal'
import { FormField, cleanId, idProblem, slugify } from './fields'

type Errors = { name?: string; id?: string }

/**
 * Adds a person to the team: the same record Settings → Equipo creates
 * (POST /api/agents with type "human"), from the roster where people live
 * next to agents.
 */
export function AddPersonModal({
  takenIds = [],
  onClose,
  onAdd,
}: {
  /** Ids already in use, so a clash is caught before the request. */
  takenIds?: readonly string[]
  onClose: () => void
  onAdd: () => void
}) {
  const t = useTranslations('agentForm')
  const tc = useTranslations('common')
  const fieldId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const idRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  // Until the user edits the id, it follows the name.
  const [customId, setCustomId] = useState<string | null>(null)
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
        body: JSON.stringify({
          id,
          name: name.trim(),
          role: role.trim() || undefined,
          type: 'human',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: unknown }
      if (data.ok) {
        onAdd()
      } else {
        setFormError(
          data.error
            ? t('createPersonFailedWith', { error: String(data.error) })
            : t('createPersonFailed'),
        )
      }
    } catch {
      setFormError(t('createPersonFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} aria-labelledby={`${fieldId}-title`}>
      <ModalHeader>
        <h2 id={`${fieldId}-title`} className="text-lg font-semibold">
          {t('addPersonTitle')}
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
                placeholder={t('personNamePlaceholder')}
                autoComplete="off"
                autoFocus
              />
            )}
          </FormField>

          <FormField id={`${fieldId}-role`} label={t('role')}>
            {(control) => (
              <Input
                {...control}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={t('personRolePlaceholder')}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField
            id={`${fieldId}-id`}
            label={t('id')}
            hint={t('personIdHint')}
            error={errors.id}
          >
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
                placeholder={t('personIdPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </FormField>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {busy ? t('creating') : t('createPerson')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
