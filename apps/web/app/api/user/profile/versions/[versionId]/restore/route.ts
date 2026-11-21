import { NextRequest, NextResponse } from 'next/server'
import { getUserProfileVersion } from '@taia/core/db'
import { saveUserProfile } from '@taia/core/services/agent-context.service'

const DEFAULT_USER_ID = 'default'

/**
 * POST /api/user/profile/versions/[versionId]/restore
 *
 * Restore a prior user profile version by saving its content as a new
 * active version. Append-only — the original row is never deleted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params

  const target = await getUserProfileVersion(versionId)
  if (!target || target.user_id !== DEFAULT_USER_ID) {
    return NextResponse.json({ error: 'version_not_found' }, { status: 404 })
  }

  let body: { createdBy?: string; note?: string } = {}
  try {
    body = (await request.json()) as { createdBy?: string; note?: string }
  } catch {
    // Empty body is fine.
  }

  const result = await saveUserProfile(DEFAULT_USER_ID, target.content, {
    createdBy: body.createdBy ?? 'ui:user-restore',
    note: body.note ?? `Restored from ${versionId}`,
  })

  return NextResponse.json({
    userId: DEFAULT_USER_ID,
    restoredFrom: versionId,
    versionId: result.versionId,
    profile: target.content,
  })
}
