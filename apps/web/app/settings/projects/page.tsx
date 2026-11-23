import { redirect } from 'next/navigation'

// Project configuration lives on each project now: /projects/<id>/settings.
// Old links land on the projects list, or on the project they named.
export default async function ProjectsSettingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>
}) {
  const { project } = await searchParams
  const id = Array.isArray(project) ? project[0] : project
  redirect(id ? `/projects/${encodeURIComponent(id)}/settings` : '/projects')
}
