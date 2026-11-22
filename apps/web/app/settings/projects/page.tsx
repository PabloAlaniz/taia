'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { Project, Repository } from '@taia/types'
import { Button, Checkbox, Input } from '@/components/atoms'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'
import { SectionCard } from '@/components/molecules/section-card'
import { ProjectContextEditor } from './_components/project-context-editor'

export default function ProjectsSettingsPage() {
  const tp = useTranslations('pageTitles')
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

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    try {
      const data = await api.projects.list()
      setProjects(data.projects || [])
    } catch {
      setError('Error loading projects')
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
      setError('Name is required')
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
          setError('Error updating project')
          setSaving(false)
          return
        }
      } else {
        const data = await api.projects.create({
          name: formName,
          description: formDesc || undefined,
        })
        if (!data.ok) {
          setError('Error creating project')
          setSaving(false)
          return
        }
      }
      resetForm()
      await fetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await api.projects.delete(id)
      if (expandedId === id) {
        setExpandedId(null)
        setRepos([])
      }
      await fetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setDeletingId(null)
  }

  async function handleSaveRepo() {
    if (!repoName.trim() || !repoUrl.trim()) {
      setError('Repo name and URL are required')
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
      setError(e instanceof Error ? e.message : String(e))
    }
    setSavingRepo(false)
  }

  async function handleDeleteRepo(repoId: string) {
    if (!expandedId) return
    setDeletingRepoId(repoId)
    try {
      await api.projects.repositories.delete(expandedId, repoId)
      await fetchRepos(expandedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setDeletingRepoId(null)
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-hidden focus:border-accent'

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <span className="text-2xl animate-pulse">...</span>
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
              <h2 className="font-semibold">Projects</h2>
              <p className="text-sm text-muted mt-1">
                Manage projects and their GitHub repositories.
              </p>
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
                + Add
              </Button>
            )}
          </div>

          {projects.length === 0 && !showForm ? (
            <div className="p-8 text-center text-sm text-muted">
              No projects yet. Add one to get started.
            </div>
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
                    >
                      {expandedId === project.id ? '▼' : '▶'}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{project.name}</div>
                      {project.description && (
                        <div className="text-xs text-muted truncate">{project.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="xs" onClick={() => startEdit(project)}>
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => handleDelete(project.id)}
                        disabled={deletingId === project.id}
                      >
                        {deletingId === project.id ? '...' : 'Delete'}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: Context + Repositories */}
                  {expandedId === project.id && (
                    <div className="bg-background border-t border-border px-6 py-3 space-y-6">
                      <div className="space-y-3">
                        <span className="text-xs font-medium text-muted uppercase">
                          Project context
                        </span>
                        <ProjectContextEditor key={project.id} projectId={project.id} />
                      </div>

                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-xs font-medium text-muted uppercase">
                          Repositories
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
                            + Add repo
                          </Button>
                        )}
                      </div>

                      {loadingRepos ? (
                        <div className="text-xs text-muted animate-pulse">Loading...</div>
                      ) : repos.length === 0 && !showRepoForm ? (
                        <div className="text-xs text-muted">No repositories.</div>
                      ) : (
                        <div className="space-y-2">
                          {repos.map((repo) => (
                            <div key={repo.id} className="flex items-center gap-2 text-sm">
                              <span className="text-muted text-xs">
                                {repo.is_primary ? '★' : '○'}
                              </span>
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
                                  primary
                                </span>
                              )}
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => startEditRepo(repo)}
                                className="text-2xs"
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => handleDeleteRepo(repo.id)}
                                disabled={deletingRepoId === repo.id}
                                className="text-2xs"
                              >
                                {deletingRepoId === repo.id ? '...' : 'Del'}
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
                              <label className="text-xs text-muted block mb-1">Name *</label>
                              <Input
                                value={repoName}
                                onChange={(e) => setRepoName(e.target.value)}
                                placeholder="my-repo"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted block mb-1">URL *</label>
                              <Input
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
                            Primary repository
                          </label>
                          <div className="flex items-center gap-2 justify-end">
                            <Button variant="ghost" size="xs" onClick={resetRepoForm}>
                              Cancel
                            </Button>
                            <Button
                              variant="primary"
                              size="md"
                              onClick={handleSaveRepo}
                              disabled={savingRepo}
                              className="text-xs"
                            >
                              {savingRepo ? '...' : editingRepoId ? 'Update' : 'Add'}
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

        {/* Add/Edit Project Form */}
        {showForm && (
          <SectionCard title={editingId ? 'Edit project' : 'New project'}>
            <div>
              <label className="text-xs text-muted block mb-1">Name *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="taia"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Description</label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Project description…"
                className={inputClass}
              />
            </div>

            {error && <div className="text-sm text-red-500">{error}</div>}

            <div className="flex items-center gap-3 justify-end">
              <Button variant="ghost" size="lg" onClick={resetForm}>
                Cancel
              </Button>
              <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  )
}
