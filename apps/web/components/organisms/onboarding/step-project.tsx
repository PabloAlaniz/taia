'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Input } from '@/components/atoms'
import { api } from '@/lib/api'

interface StepProjectProps {
  /** Called after the project was created, or when the step is skipped. */
  onDone: () => void
}

/** Repo name from its URL: the last path segment without `.git`. */
function repoNameFromUrl(url: string): string {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() ?? url
  return last.replace(/\.git$/, '') || url
}

/**
 * Onboarding: the first project — who or what the work is for. It comes
 * before the first workspace (how the work flows) because a project cuts
 * across workspaces and gives agents its context in all of them.
 */
export function StepProject({ onDone }: StepProjectProps) {
  const t = useTranslations('onboarding')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await api.projects.create({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      if (!res.ok || !res.project) throw new Error(t('projectError'))
      const url = repoUrl.trim()
      if (url) {
        await api.projects.repositories.create(res.project.id, {
          name: repoNameFromUrl(url),
          url,
          is_primary: true,
        })
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('projectError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">{t('projectTitle')}</h2>
        <p className="text-sm text-muted">{t('projectDesc')}</p>
      </div>
      <div className="space-y-3">
        <Input
          aria-label={t('projectName')}
          placeholder={t('projectName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Input
          aria-label={t('projectDescription')}
          placeholder={t('projectDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          aria-label={t('projectRepo')}
          placeholder={t('projectRepo')}
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('skipProject')}
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving || !name.trim()}>
          {t('createProject')}
        </Button>
      </div>
    </form>
  )
}
