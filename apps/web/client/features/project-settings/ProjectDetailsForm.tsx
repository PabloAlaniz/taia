'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Project } from '@taia/types'
import { Alert, Button, Input } from '@/components/atoms'
import { api } from '@/lib/api'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The project's name and its one-line description, as the projects list shows them. */
export function ProjectDetailsForm({
  project,
  onSaved,
}: {
  project: Project
  onSaved: (project: Project) => void
}) {
  const t = useTranslations('settingsProjects')
  const tc = useTranslations('settingsCommon')
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const dirty = name !== project.name || description !== (project.description ?? '')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setMessage({ type: 'error', text: t('errors.nameRequired') })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const data = await api.projects.update(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      })
      if (!data.ok) throw new Error(t('errors.unknown'))
      onSaved(data.project ?? { ...project, name: name.trim(), description: description.trim() })
      setMessage({ type: 'success', text: t('detailsSaved') })
    } catch (err) {
      setMessage({ type: 'error', text: t('errors.save', { error: errorText(err) }) })
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label htmlFor="project-name" className="text-xs text-muted block mb-1">
          {t('nameLabel')} *
        </label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
        />
      </div>
      <div>
        <label htmlFor="project-description" className="text-xs text-muted block mb-1">
          {t('descLabel')}
        </label>
        <Input
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descPlaceholder')}
        />
      </div>
      {message && <Alert variant={message.type}>{message.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" disabled={saving || !dirty}>
          {saving ? tc('saving') : t('update')}
        </Button>
      </div>
    </form>
  )
}
