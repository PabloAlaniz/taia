'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Project } from '@taia/types'
import { EmptyState, RackSection, SkeletonCard } from '@/components/molecules'
import { PageHeader } from '@/components/molecules/page-header'
import { ProjectViewNav } from '@/components/molecules/project-view-nav'
import { DeleteProject } from '@/client/features/project-settings/DeleteProject'
import { ProjectContextEditor } from '@/client/features/project-settings/ProjectContextEditor'
import { ProjectDetailsForm } from '@/client/features/project-settings/ProjectDetailsForm'
import { ProjectRepositories } from '@/client/features/project-settings/ProjectRepositories'
import { api } from '@/lib/api'

/** Paper for a form inside a rack: card ground, so strips inside it still read. */
const PANEL = 'bg-card rounded-[2px] p-4 text-foreground'

// A project's configuration: name, the context agents receive, repositories,
// and deleting it. Same header as the overview, so the views switch in place.
export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()
  const t = useTranslations('projectsPage')
  const ts = useTranslations('settingsProjects')
  const tp = useTranslations('pageTitles')
  const [project, setProject] = useState<Project | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    api.projects
      .get(projectId)
      .then((data) => !cancelled && setProject(data.ok ? data.project : null))
      .catch(() => !cancelled && setProject(null))
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (project === undefined) {
    return (
      <div className="mx-auto px-4 md:px-6 max-w-6xl pt-5 space-y-3">
        <SkeletonCard height="h-10" />
        <SkeletonCard height="h-48" />
      </div>
    )
  }
  if (project === null) {
    return (
      <div className="min-h-full">
        <PageHeader
          width="data"
          title={t('title')}
          backHref="/projects"
          backLabel={tp('projects')}
        />
        <div className="mx-auto px-4 md:px-6 max-w-6xl pt-4 pb-10">
          <EmptyState title={t('notFound')} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <PageHeader width="data" title={project.name} backHref="/projects" backLabel={tp('projects')}>
        <ProjectViewNav projectId={project.id} current="settings" />
      </PageHeader>

      {/* The header keeps the overview's width; the forms keep a reading width. */}
      <div className="mx-auto px-4 md:px-6 max-w-6xl pt-4 pb-10">
        <div className="max-w-2xl space-y-4">
          <RackSection id="project-details" title={ts('detailsHeading')}>
            <div className={PANEL}>
              <ProjectDetailsForm key={project.id} project={project} onSaved={setProject} />
            </div>
          </RackSection>

          <RackSection id="project-context" title={ts('contextHeading')}>
            <div className={PANEL}>
              <ProjectContextEditor key={project.id} projectId={project.id} />
            </div>
          </RackSection>

          <RackSection id="project-repositories" title={ts('reposHeading')}>
            <div className={PANEL}>
              <ProjectRepositories key={project.id} projectId={project.id} />
            </div>
          </RackSection>

          <RackSection id="project-delete" title={ts('dangerHeading')}>
            <div className={PANEL}>
              <DeleteProject project={project} onDeleted={() => router.push('/projects')} />
            </div>
          </RackSection>
        </div>
      </div>
    </div>
  )
}
