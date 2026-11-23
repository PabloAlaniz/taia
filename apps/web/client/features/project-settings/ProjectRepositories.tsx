'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Circle, Plus, Star } from 'lucide-react'
import type { Repository } from '@taia/types'
import { Alert, Button, Checkbox, Input, Strip } from '@/components/atoms'
import { ConfirmDialog } from '@/components/molecules/confirm-dialog'
import { api } from '@/lib/api'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * A project's repositories: list, add, edit, mark primary and remove. The
 * caller titles the section.
 */
export function ProjectRepositories({ projectId }: { projectId: string }) {
  const t = useTranslations('settingsProjects')
  const tc = useTranslations('settingsCommon')
  const tCommon = useTranslations('common')
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [primary, setPrimary] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmRepo, setConfirmRepo] = useState<Repository | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function fetchRepos() {
    try {
      const data = await api.projects.repositories.list(projectId)
      setRepos(data.repositories || [])
    } catch {
      setRepos([])
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    api.projects.repositories
      .list(projectId)
      .then((data) => !cancelled && setRepos(data.repositories || []))
      .catch(() => !cancelled && setRepos([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [projectId])

  function resetForm() {
    setName('')
    setUrl('')
    setPrimary(false)
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(repo: Repository) {
    setEditingId(repo.id)
    setName(repo.name)
    setUrl(repo.url)
    setPrimary(repo.is_primary)
    setShowForm(true)
    setError('')
  }

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      setError(t('errors.repoRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const data = { name, url, is_primary: primary }
      if (editingId) {
        await api.projects.repositories.update(projectId, editingId, data)
      } else {
        await api.projects.repositories.create(projectId, data)
      }
      resetForm()
      await fetchRepos()
    } catch (e) {
      setError(t('errors.repoSave', { error: errorText(e) }))
    }
    setSaving(false)
  }

  async function handleDelete(repoId: string) {
    setDeletingId(repoId)
    setDeleteError(null)
    try {
      await api.projects.repositories.delete(projectId, repoId)
      setConfirmRepo(null)
      await fetchRepos()
    } catch (e) {
      setDeleteError(t('errors.repoDelete', { error: errorText(e) }))
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-3">
      {!showForm && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="inline-flex items-center gap-1"
          >
            <Plus size={13} aria-hidden="true" />
            {t('addRepo')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-mid text-muted" role="status">
          {t('loadingRepos')}
        </div>
      ) : repos.length === 0 && !showForm ? (
        <div className="text-mid text-muted">{t('noRepos')}</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {repos.map((repo) => (
            <li key={repo.id}>
              <Strip className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                {repo.is_primary ? (
                  <Star size={12} className="shrink-0 text-muted fill-current" aria-hidden="true" />
                ) : (
                  <Circle size={12} className="shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className="text-sm font-semibold">{repo.name}</span>
                {repo.is_primary && (
                  <span className="text-xxs font-semibold text-foreground bg-card border border-border px-1.5 py-px rounded-[3px]">
                    {t('primary')}
                  </span>
                )}
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mid text-accent hover:underline truncate flex-1 min-w-0 basis-40"
                >
                  {repo.url}
                </a>
                <span className="flex items-center gap-1 ml-auto">
                  <Button variant="ghost" size="xs" onClick={() => startEdit(repo)}>
                    {tCommon('edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setDeleteError(null)
                      setConfirmRepo(repo)
                    }}
                    disabled={deletingId === repo.id}
                  >
                    {deletingId === repo.id ? t('deleting') : tCommon('delete')}
                  </Button>
                </span>
              </Strip>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="border border-border rounded-[2px] p-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="repo-name" className="text-xs text-muted block mb-1">
                {t('repoNameLabel')} *
              </label>
              <Input
                id="repo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('repoNamePlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="repo-url" className="text-xs text-muted block mb-1">
                {t('repoUrlLabel')} *
              </label>
              <Input
                id="repo-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <Checkbox checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
            {t('repoPrimaryLabel')}
          </label>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              {tCommon('cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? tc('saving') : editingId ? t('repoUpdate') : t('repoCreate')}
            </Button>
          </div>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <ConfirmDialog
        open={confirmRepo !== null}
        title={t('confirmDeleteRepo.title', { name: confirmRepo?.name ?? '' })}
        body={t('confirmDeleteRepo.body')}
        confirmLabel={t('confirmDeleteRepo.action')}
        cancelLabel={tCommon('cancel')}
        destructive
        busy={deletingId !== null}
        error={deleteError}
        onConfirm={() => confirmRepo && handleDelete(confirmRepo.id)}
        onCancel={() => {
          setConfirmRepo(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}
