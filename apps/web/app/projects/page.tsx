'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { Project } from '@taia/types'
import { Button, Input } from '@/components/atoms'
import { Card } from '@/components/molecules/card'
import { PageHeader } from '@/components/molecules/page-header'
import { api } from '@/lib/api'

// Projects cut across workspaces: this page lists every project, whatever
// workspace is active.
export default function ProjectsPage() {
  const t = useTranslations('projectsPage')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const data = await api.projects.list()
    setProjects(data.projects ?? [])
  }

  useEffect(() => {
    api.projects
      .list()
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.projects.create({ name: name.trim(), description: description.trim() || undefined })
      setName('')
      setDescription('')
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={t('title')} icon="🗂️">
        <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          {t('new')}
        </Button>
      </PageHeader>

      <main className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
        <p className="text-sm text-muted">{t('intro')}</p>

        {showForm && (
          <Card padding="md">
            <form onSubmit={create} className="flex flex-col gap-3">
              <Input
                aria-label={t('name')}
                placeholder={t('name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Input
                aria-label={t('description')}
                placeholder={t('description')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={saving || !name.trim()}>
                  {t('create')}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {projects === null ? (
          <span className="text-2xl">⏳</span>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="no-underline text-foreground">
                <Card variant="interactive" padding="md" className="h-full">
                  <h2 className="font-semibold">{p.name}</h2>
                  {p.description && <p className="text-sm text-muted mt-1">{p.description}</p>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
