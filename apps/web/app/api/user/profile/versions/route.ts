import { NextRequest, NextResponse } from 'next/server'
import { listUserProfileVersions } from '@taia/core/db'

const DEFAULT_USER_ID = 'default'

/**
 * GET /api/user/profile/versions
 *
 * User profile history, newest first. ?limit clamped to [1, 200],
 * default 50.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50

  const rows = await listUserProfileVersions(DEFAULT_USER_ID, limit)

  return NextResponse.json({
    userId: DEFAULT_USER_ID,
    versions: rows.map((r) => ({
      versionId: r.id,
      content: r.content,
      createdAt: r.created_at,
      createdBy: r.created_by,
      note: r.note,
    })),
  })
}
