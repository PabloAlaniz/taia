'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Circle, FolderPlus, Plus, Star } from 'lucide-react'
import { api } from '@/lib/api'
import type { Project, Repository } from '@taia/types'
import { Alert, Button, Checkbox, Input, Strip } from '@/components/atoms'
import { ConfirmDialog } from '@/components/molecules/confirm-dialog'
import { EmptyState } from '@/components/molecules/empty-state'
import { PageHeader } from '@/components/molecules/page-header'
import { RackSection } from '@/components/molecules/rack-section'
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

  if (loading) {
    return (
      <div className="min-h-full bg-background">
        <PageHeader
          width="form"
          title={tp('projects')}
          backHref="/settings"
          backLabel={tp('settings')}
        />
        <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto">
          <span className="text-sm text-muted" role="status">
            {tCommon('loading')}
          </span>
        </div>
      </div>
    )
  }

  const openNewForm = () => {
    resetForm()
    setShowForm(true)
  }

  return (
    <div className="min-h-full bg-background">
      <PageHeader
        width="form"
        title={tp('projects')}
        backHref="/settings"
        backLabel={tp('settings')}
      >
        {!showForm && (
          <Button
            variant="primary"
            size="md"
            onClick={openNewForm}
            className="inline-flex items-center gap-1.5"
          >
            <Plus size={15} aria-hidden="true" />
            {t('add')}
          </Button>
        )}
      </PageHeader>

      <div className="px-4 md:px-6 pt-5 pb-10 max-w-2xl mx-auto space-y-6">
        <p className="text-sm text-muted max-w-prose">{t('listDesc')}</p>

        <RackSection id="settings-projects" title={t('listTitle')} count={projects.length}>
          {projects.length === 0 ? (
            <EmptyState
              onRack
              className="py-4 px-0"
              icon={<FolderPlus size={20} aria-hidden="true" />}
              title={t('emptyTitle')}
              description={t('emptyHint')}
              action={
                !showForm && (
                  <Button variant="secondary" size="md" onClick={openNewForm}>
                    {t('add')}
                  </Button>
                )
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {projects.map((project) => {
                const expanded = expandedId === project.id
                return (
                  <li key={project.id} className="flex flex-col gap-1.5">
                    <Strip className="flex items-center gap-2 pl-2 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(project.id)}
                        className="px-1.5 text-muted hover:text-foreground"
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? t('collapse', { name: project.name })
                            : t('expand', { name: project.name })
                        }
                      >
                        {expanded ? (
                          <ChevronDown size={15} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={15} aria-hidden="true" />
                        )}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{project.name}</div>
                        {project.description && (
                          <div className="text-mid text-muted truncate">{project.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(project)}>
                          {tCommon('edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmProject(project)
                          }}
                          disabled={deletingId === project.id}
                        >
                          {deletingId === project.id ? t('deleting') : tCommon('delete')}
                        </Button>
                      </div>
                    </Strip>

                    {/* Expanded: context and repositories, on card paper under the strip */}
                    {expanded && (
                      <div className="bg-card rounded-[2px] ml-4 p-4 space-y-6 text-foreground">
                        <section className="space-y-3">
                          <h3 className="text-sm font-semibold">{t('contextHeading')}</h3>
                          <ProjectContextEditor key={project.id} projectId={project.id} />
                        </section>

                        <section className="space-y-3 border-t border-border pt-4">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">{t('reposHeading')}</h3>
                            {!showRepoForm && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  resetRepoForm()
                                  setShowRepoForm(true)
                                }}
                                className="inline-flex items-center gap-1"
                              >
                                <Plus size={13} aria-hidden="true" />
                                {t('addRepo')}
                              </Button>
                            )}
                          </div>

                          {loadingRepos ? (
                            <div className="text-mid text-muted" role="status">
                              {t('loadingRepos')}
                            </div>
                          ) : repos.length === 0 && !showRepoForm ? (
                            <div className="text-mid text-muted">{t('noRepos')}</div>
                          ) : (
                            <ul className="flex flex-col gap-1.5">
                              {repos.map((repo) => (
                                <li key={repo.id}>
                                  <Strip className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                                    {repo.is_primary ? (
                                      <Star
                                        size={12}
                                        className="shrink-0 text-muted fill-current"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Circle
                                        size={12}
                                        className="shrink-0 text-muted"
                                        aria-hidden="true"
                                      />
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
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => startEditRepo(repo)}
                                      >
                                        {tCommon('edit')}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => {
                                          setDeleteError(null)
                                          setConfirmRepo(repo)
                                        }}
                                        disabled={deletingRepoId === repo.id}
                                      >
                                        {deletingRepoId === repo.id
                                          ? t('deleting')
                                          : tCommon('delete')}
                                      </Button>
                                    </span>
                                  </Strip>
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* Repo Form */}
                          {showRepoForm && (
                            <div className="border border-border rounded-[2px] p-3 space-y-3">
                              <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                  <label
                                    htmlFor="repo-name"
                                    className="text-xs text-muted block mb-1"
                                  >
                                    {t('repoNameLabel')} *
                                  </label>
                                  <Input
                                    id="repo-name"
                                    value={repoName}
                                    onChange={(e) => setRepoName(e.target.value)}
                                    placeholder={t('repoNamePlaceholder')}
                                  />
                                </div>
                                <div>
                                  <label
                                    htmlFor="repo-url"
                                    className="text-xs text-muted block mb-1"
                                  >
                                    {t('repoUrlLabel')} *
                                  </label>
                                  <Input
                                    id="repo-url"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/org/repo"
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
                                <Button variant="ghost" size="sm" onClick={resetRepoForm}>
                                  {tCommon('cancel')}
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={handleSaveRepo}
                                  disabled={savingRepo}
                                >
                                  {savingRepo
                                    ? tc('saving')
                                    : editingRepoId
                                      ? t('repoUpdate')
                                      : t('repoCreate')}
                                </Button>
                              </div>
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </RackSection>

        {error && !showForm && <Alert variant="error">{error}</Alert>}

        {/* Add/Edit Project Form */}
        {showForm && (
          <SectionCard
            className="rounded-md"
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
