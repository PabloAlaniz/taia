import { NextRequest, NextResponse } from 'next/server'
import { getProjectByIdFull, listProjectContextVersions } from '@taia/core/db'

/**
 * GET /api/projects/[projectId]/context/versions
 *
 * Project-context history, newest first. ?limit clamped to [1, 200],
 * default 50. Each entry includes content for preview.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params

  const project = await getProjectByIdFull(projectId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50

  const rows = await listProjectContextVersions(projectId, limit)

  return NextResponse.json({
    projectId,
    versions: rows.map((r) => ({
      versionId: r.id,
      content: r.content,
      createdAt: r.created_at,
      createdBy: r.created_by,
      note: r.note,
    })),
  })
}
