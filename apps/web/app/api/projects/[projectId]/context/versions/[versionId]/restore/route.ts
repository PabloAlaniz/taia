import { NextRequest, NextResponse } from 'next/server'
import { getProjectByIdFull, getProjectContextVersion } from '@taia/core/db'
import { saveProjectContext } from '@taia/core/services/agent-context.service'

/**
 * POST /api/projects/[projectId]/context/versions/[versionId]/restore
 *
 * Restore a prior project context version by saving its content as a new
 * active version (append-only). saveProjectContext also mirrors
 * glossary/knowledge_refs to the projects row so non-bundle readers see
 * the rolled-back values immediately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; versionId: string }> },
) {
  const { projectId, versionId } = await params

  const project = await getProjectByIdFull(projectId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  const target = await getProjectContextVersion(versionId)
  if (!target || target.project_id !== projectId) {
    return NextResponse.json({ error: 'version_not_found' }, { status: 404 })
  }

  let body: { createdBy?: string; note?: string } = {}
  try {
    body = (await request.json()) as { createdBy?: string; note?: string }
  } catch {
    // Empty body is fine.
  }

  const result = await saveProjectContext(projectId, target.content, {
    createdBy: body.createdBy ?? 'ui:project-restore',
    note: body.note ?? `Restored from ${versionId}`,
  })

  return NextResponse.json({
    projectId,
    restoredFrom: versionId,
    versionId: result.versionId,
    context: target.content,
  })
}
