import { NextRequest, NextResponse } from 'next/server'
import { getLatestUserProfileVersion } from '@taia/core/db'
import { saveUserProfile } from '@taia/core/services/agent-context.service'
import type { UserProfile } from '@taia/types'

// TAIA is single-user today. The route is /api/user/profile (no userId);
// the singleton id 'default' lives here so the rest of the codebase
// (context.service, agent-context.service) shares the same key.
const DEFAULT_USER_ID = 'default'

const FALLBACK_PROFILE: UserProfile = {
  id: DEFAULT_USER_ID,
  displayName: 'TAIA user',
}

/**
 * GET /api/user/profile
 *
 * Returns the latest user profile + version metadata. When no version
 * exists yet, returns the singleton fallback so the UI always has
 * something to render and the "Save" button has a baseline to diff.
 */
export async function GET(_request: NextRequest) {
  const version = await getLatestUserProfileVersion(DEFAULT_USER_ID)
  if (!version) {
    return NextResponse.json({
      userId: DEFAULT_USER_ID,
      profile: FALLBACK_PROFILE,
      versionId: null,
      versionCreatedAt: null,
      versionCreatedBy: null,
      versionNote: null,
    })
  }

  return NextResponse.json({
    userId: DEFAULT_USER_ID,
    profile: version.content,
    versionId: version.id,
    versionCreatedAt: version.created_at,
    versionCreatedBy: version.created_by,
    versionNote: version.note,
  })
}

/**
 * PATCH /api/user/profile
 *
 * Save a new user_profile_versions row. Body is a partial UserProfile
 * merged over the latest version (or the fallback if none yet) so the UI
 * can patch one field at a time. Always append-only.
 */
export async function PATCH(request: NextRequest) {
  let body: { profile?: Partial<UserProfile>; note?: string; createdBy?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.profile || typeof body.profile !== 'object') {
    return NextResponse.json({ error: 'profile_required' }, { status: 400 })
  }

  const current = await getLatestUserProfileVersion(DEFAULT_USER_ID)
  const base: UserProfile = current?.content ?? FALLBACK_PROFILE

  const merged: UserProfile = {
    id: DEFAULT_USER_ID,
    displayName: body.profile.displayName ?? base.displayName,
    preferences: body.profile.preferences ?? base.preferences,
    facts: body.profile.facts ?? base.facts,
    doNotDo: body.profile.doNotDo ?? base.doNotDo,
  }

  const result = await saveUserProfile(DEFAULT_USER_ID, merged, {
    createdBy: body.createdBy ?? 'ui:user-profile',
    note: body.note,
  })

  return NextResponse.json({
    userId: DEFAULT_USER_ID,
    profile: merged,
    versionId: result.versionId,
  })
}
