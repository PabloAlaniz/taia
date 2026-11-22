'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Circle, Plus, Star } from 'lucide-react'
import { api } from '@/lib/api'
import type { Project, Repository } from '@taia/types'
import { Alert, Button, Checkbox, Input } from '@/components/atoms'
import { Card } from '@/components/molecules/card'
import { ConfirmDialog } from '@/components/molecules/confirm-dialog'
import { PageHeader } from '@/components/molecules/page-header'
import { SectionCard } from '@/components/molecules/section-card'
import { ProjectContextEditor } from './_components/project-context-editor'

export default function ProjectsSettingsPage() {
  const tp = useTranslations('pageTitles')
  const t = useTranslations('settingsProjects')
  const tc = useTranslations('settingsCommon')
  const tCommon = useTranslations('common')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Project form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Expanded project repos
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [repos, setRepos] = useState<Repository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)

  // Repo form
  const [showRepoForm, setShowRepoForm] = useState(false)
  const [repoName, setRepoName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoPrimary, setRepoPrimary] = useState(false)
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null)
  const [savingRepo, setSavingRepo] = useState(false)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null)
  const [confirmProject, setConfirmProject] = useState<Project | null>(null)
  const [confirmRepo, setConfirmRepo] = useState<Repository | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

  useEffect(() => {
    fetchProjects()
    // Loads once on mount; fetchProjects only reads t for its error text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchProjects() {
    try {
      const data = await api.projects.list()
      setProjects(data.projects || [])
    } catch {
      setError(t('errors.load'))
    }
    setLoading(false)
  }

  async function fetchRepos(projectId: string) {
    setLoadingRepos(true)
    try {
      const data = await api.projects.repositories.list(projectId)
      setRepos(data.repositories || [])
    } catch {
      setRepos([])
    }
    setLoadingRepos(false)
  }

  function resetForm() {
    setFormName('')
    setFormDesc('')
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function resetRepoForm() {
    setRepoName('')
    setRepoUrl('')
    setRepoPrimary(false)
    setEditingRepoId(null)
    setShowRepoForm(false)
  }

  function startEdit(project: Project) {
    setEditingId(project.id)
    setFormName(project.name)
    setFormDesc(project.description || '')
    setShowForm(true)
    setError('')
  }

  function startEditRepo(repo: Repository) {
    setEditingRepoId(repo.id)
    setRepoName(repo.name)
    setRepoUrl(repo.url)
    setRepoPrimary(repo.is_primary)
    setShowRepoForm(true)
  }

  async function toggleExpand(projectId: string) {
    if (expandedId === projectId) {
      setExpandedId(null)
      setRepos([])
      resetRepoForm()
    } else {
      setExpandedId(projectId)
      resetRepoForm()
      await fetchRepos(projectId)
    }
  }

  async function handleSave() {
    if (!formName.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const data = await api.projects.update(editingId, {
          name: formName,
          description: formDesc || undefined,
        })
        if (!data.ok) {
          setError(t('errors.save', { error: t('errors.unknown') }))
          setSaving(false)
          return
        }
      } else {
        const data = await api.projects.create({
          name: formName,
          description: formDesc || undefined,
        })
        if (!data.ok) {
          setError(t('errors.save', { error: t('errors.unknown') }))
          setSaving(false)
          return
        }
      }
      resetForm()
      await fetchProjects()
    } catch (e) {
      setError(t('errors.save', { error: errorText(e) }))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      await api.projects.delete(id)
      if (expandedId === id) {
        setExpandedId(null)
        setRepos([])
      }
      setConfirmProject(null)
      await fetchProjects()
    } catch (e) {
      setDeleteError(t('errors.delete', { error: errorText(e) }))
    }
    setDeletingId(null)
  }

  async function handleSaveRepo() {
    if (!repoName.trim() || !repoUrl.trim()) {
      setError(t('errors.repoRequired'))
      return
    }
    if (!expandedId) return
    setSavingRepo(true)
    setError('')
    try {
      if (editingRepoId) {
        await api.projects.repositories.update(expandedId, editingRepoId, {
          name: repoName,
          url: repoUrl,
          is_primary: repoPrimary,
        })
      } else {
        await api.projects.repositories.create(expandedId, {
          name: repoName,
          url: repoUrl,
          is_primary: repoPrimary,
        })
      }
      resetRepoForm()
      await fetchRepos(expandedId)
    } catch (e) {
      setError(t('errors.repoSave', { error: errorText(e) }))
    }
    setSavingRepo(false)
  }

  async function handleDeleteRepo(repoId: string) {
    if (!expandedId) return
    setDeletingRepoId(repoId)
    setDeleteError(null)
    try {
      await api.projects.repositories.delete(expandedId, repoId)
      setConfirmRepo(null)
      await fetchRepos(expandedId)
    } catch (e) {
      setDeleteError(t('errors.repoDelete', { error: errorText(e) }))
    }
    setDeletingRepoId(null)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span className="text-sm text-muted animate-pulse" role="status">
          {tCommon('loading')}
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        width="form"
        title={tp('projects')}
        backHref="/settings"
        backLabel={tp('settings')}
      />

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-8">
        {/* Project List */}
        <Card padding="none" className="rounded-lg">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{t('listTitle')}</h2>
              <p className="text-sm text-muted mt-1">{t('listDesc')}</p>
            </div>
            {!showForm && (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  resetForm()
                  setShowForm(true)
                }}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('add')}
              </Button>
            )}
          </div>

          {projects.length === 0 && !showForm ? (
            <div className="p-8 text-center text-sm text-muted">{t('empty')}</div>
          ) : (
            <div className="divide-y divide-border">
              {projects.map((project) => (
                <div key={project.id}>
                  <div className="p-4 flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => toggleExpand(project.id)}
                      className="text-muted hover:text-foreground"
                      aria-expanded={expandedId === project.id}
                      aria-label={
                        expandedId === project.id
                          ? t('collapse', { name: project.name })
                          : t('expand', { name: project.name })
                      }
                    >
                      {expandedId === project.id ? (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{project.name}</div>
                      {project.description && (
                        <div className="text-xs text-muted truncate">{project.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="xs" onClick={() => startEdit(project)}>
                        {tCommon('edit')}
                      </Button>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => {
                          setDeleteError(null)
                          setConfirmProject(project)
                        }}
                        disabled={deletingId === project.id}
                      >
                        {deletingId === project.id ? t('deleting') : tCommon('delete')}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: Context + Repositories */}
                  {expandedId === project.id && (
                    <div className="bg-background border-t border-border px-6 py-3 space-y-6">
                      <div className="space-y-3">
                        <span className="text-xs font-medium text-muted uppercase">
                          {t('contextHeading')}
                        </span>
                        <ProjectContextEditor key={project.id} projectId={project.id} />
                      </div>

                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-xs font-medium text-muted uppercase">
                          {t('reposHeading')}
                        </span>
                        {!showRepoForm && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              resetRepoForm()
                              setShowRepoForm(true)
                            }}
                            className="text-accent hover:underline"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                            {t('addRepo')}
                          </Button>
                        )}
                      </div>

                      {loadingRepos ? (
                        <div className="text-xs text-muted animate-pulse" role="status">
                          {t('loadingRepos')}
                        </div>
                      ) : repos.length === 0 && !showRepoForm ? (
                        <div className="text-xs text-muted">{t('noRepos')}</div>
                      ) : (
                        <div className="space-y-2">
                          {repos.map((repo) => (
                            <div key={repo.id} className="flex items-center gap-2 text-sm">
                              {repo.is_primary ? (
                                <Star
                                  className="w-3 h-3 shrink-0 text-muted fill-current"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Circle
                                  className="w-3 h-3 shrink-0 text-muted"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="font-medium text-xs">{repo.name}</span>
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-accent hover:underline truncate flex-1"
                              >
                                {repo.url}
                              </a>
                              {repo.is_primary && (
                                <span className="text-2xs bg-accent/20 text-accent px-1.5 py-0.5 rounded-sm">
                                  {t('primary')}
                                </span>
                              )}
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => startEditRepo(repo)}
                                className="text-2xs"
                              >
                                {tCommon('edit')}
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => {
                                  setDeleteError(null)
                                  setConfirmRepo(repo)
                                }}
                                disabled={deletingRepoId === repo.id}
                                className="text-2xs"
                              >
                                {deletingRepoId === repo.id ? t('deleting') : tCommon('delete')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Repo Form */}
                      {showRepoForm && (
                        <Card padding="none" className="p-3 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="repo-name" className="text-xs text-muted block mb-1">
                                {t('repoNameLabel')} *
                              </label>
                              <Input
                                id="repo-name"
                                value={repoName}
                                onChange={(e) => setRepoName(e.target.value)}
                                placeholder={t('repoNamePlaceholder')}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label htmlFor="repo-url" className="text-xs text-muted block mb-1">
                                {t('repoUrlLabel')} *
                              </label>
                              <Input
                                id="repo-url"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/org/repo"
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted">
                            <Checkbox
                              checked={repoPrimary}
                              onChange={(e) => setRepoPrimary(e.target.checked)}
                            />
                            {t('repoPrimaryLabel')}
                          </label>
                          <div className="flex items-center gap-2 justify-end">
                            <Button variant="ghost" size="xs" onClick={resetRepoForm}>
                              {tCommon('cancel')}
                            </Button>
                            <Button
                              variant="primary"
                              size="md"
                              onClick={handleSaveRepo}
                              disabled={savingRepo}
                              className="text-xs"
                            >
                              {savingRepo
                                ? tc('saving')
                                : editingRepoId
                                  ? t('repoUpdate')
                                  : t('repoCreate')}
                            </Button>
                          </div>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {error && !showForm && <Alert variant="error">{error}</Alert>}

        {/* Add/Edit Project Form */}
        {showForm && (
          <SectionCard
            title={
              editingId
                ? t('editTitle', {
                    name: projects.find((p) => p.id === editingId)?.name ?? editingId,
                  })
                : t('newTitle')
            }
          >
            <div>
              <label htmlFor="project-name" className="text-xs text-muted block mb-1">
                {t('nameLabel')} *
              </label>
              <Input
                id="project-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="project-description" className="text-xs text-muted block mb-1">
                {t('descLabel')}
              </label>
              <Input
                id="project-description"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder={t('descPlaceholder')}
                className={inputClass}
              />
            </div>

            {error && (
              <div role="alert" className="text-sm text-alert">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 justify-end">
              <Button variant="ghost" size="lg" onClick={resetForm}>
                {tCommon('cancel')}
              </Button>
              <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
                {saving ? tc('saving') : editingId ? t('update') : t('create')}
              </Button>
            </div>
          </SectionCard>
        )}

        <ConfirmDialog
          open={confirmProject !== null}
          title={t('confirmDelete.title', { name: confirmProject?.name ?? '' })}
          body={t('confirmDelete.body')}
          confirmLabel={t('confirmDelete.action')}
          cancelLabel={tCommon('cancel')}
          destructive
          busy={deletingId !== null}
          error={deleteError}
          onConfirm={() => confirmProject && handleDelete(confirmProject.id)}
          onCancel={() => {
            setConfirmProject(null)
            setDeleteError(null)
          }}
        />

        <ConfirmDialog
          open={confirmRepo !== null}
          title={t('confirmDeleteRepo.title', { name: confirmRepo?.name ?? '' })}
          body={t('confirmDeleteRepo.body')}
          confirmLabel={t('confirmDeleteRepo.action')}
          cancelLabel={tCommon('cancel')}
          destructive
          busy={deletingRepoId !== null}
          error={deleteError}
          onConfirm={() => confirmRepo && handleDeleteRepo(confirmRepo.id)}
          onCancel={() => {
            setConfirmRepo(null)
            setDeleteError(null)
          }}
        />
      </div>
    </div>
  )
}
