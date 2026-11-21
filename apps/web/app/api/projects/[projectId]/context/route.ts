import { NextRequest, NextResponse } from 'next/server'
import { getLatestProjectContextVersion, getProjectByIdFull } from '@taia/core/db'
import { saveProjectContext } from '@taia/core/services/agent-context.service'
import type { ProjectContext } from '@taia/types'

/**
 * GET /api/projects/[projectId]/context
 *
 * Returns the latest project context version + version metadata. When the
 * project has no version yet (created before context versioning), the
 * route shapes a context from the projects row itself (name + description +
 * glossary + knowledge_refs JSONB) so the UI always has something to
 * render.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params

  const project = await getProjectByIdFull(projectId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  const version = await getLatestProjectContextVersion(projectId)
  if (version) {
    return NextResponse.json({
      projectId,
      context: version.content,
      versionId: version.id,
      versionCreatedAt: version.created_at,
      versionCreatedBy: version.created_by,
      versionNote: version.note,
    })
  }

  // No version yet — derive an initial context from the projects row.
  const derived: ProjectContext = {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    glossary: project.glossary ?? undefined,
    knowledgeRefs: project.knowledge_refs ?? undefined,
  }
  return NextResponse.json({
    projectId,
    context: derived,
    versionId: null,
    versionCreatedAt: null,
    versionCreatedBy: null,
    versionNote: null,
  })
}

/**
 * PATCH /api/projects/[projectId]/context
 *
 * Save a new project_context_versions row. Body is a partial ProjectContext
 * merged over the latest version (so the UI can patch glossary/knowledge
 * without re-sending everything). Always append-only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params

  const project = await getProjectByIdFull(projectId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  let body: { context?: Partial<ProjectContext>; note?: string; createdBy?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.context || typeof body.context !== 'object') {
    return NextResponse.json({ error: 'context_required' }, { status: 400 })
  }

  const current = await getLatestProjectContextVersion(projectId)
  const base: ProjectContext = current?.content ?? {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    glossary: project.glossary ?? undefined,
    knowledgeRefs: project.knowledge_refs ?? undefined,
  }

  const merged: ProjectContext = {
    id: project.id,
    name: body.context.name ?? base.name,
    description: body.context.description ?? base.description,
    glossary: body.context.glossary ?? base.glossary,
    knowledgeRefs: body.context.knowledgeRefs ?? base.knowledgeRefs,
  }

  const result = await saveProjectContext(projectId, merged, {
    createdBy: body.createdBy ?? 'ui:project-context',
    note: body.note,
  })

  return NextResponse.json({
    projectId,
    context: merged,
    versionId: result.versionId,
  })
}
