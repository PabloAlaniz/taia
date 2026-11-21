import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { UserProfile } from '@taia/types'

// --- Mocks ---

const mockGetLatestUserProfileVersion = vi.fn()
const mockListUserProfileVersions = vi.fn()
const mockGetUserProfileVersion = vi.fn()
const mockSaveUserProfile = vi.fn()

vi.mock('@taia/core/db', () => ({
  getLatestUserProfileVersion: (...args: unknown[]) => mockGetLatestUserProfileVersion(...args),
  listUserProfileVersions: (...args: unknown[]) => mockListUserProfileVersions(...args),
  getUserProfileVersion: (...args: unknown[]) => mockGetUserProfileVersion(...args),
}))

vi.mock('@taia/core/services/agent-context.service', () => ({
  saveUserProfile: (...args: unknown[]) => mockSaveUserProfile(...args),
}))

import { GET, PATCH } from '@/app/api/user/profile/route'
import { GET as GET_VERSIONS } from '@/app/api/user/profile/versions/route'
import { POST as POST_RESTORE } from '@/app/api/user/profile/versions/[versionId]/restore/route'

const sampleProfile: UserProfile = {
  id: 'default',
  displayName: 'Sam',
  facts: ['likes short answers'],
  preferences: { language: 'es' },
  doNotDo: ['guess when uncertain'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/user/profile', () => {
  it('returns the singleton fallback when no version exists', async () => {
    mockGetLatestUserProfileVersion.mockResolvedValueOnce(null)
    const req = new NextRequest('http://localhost/api/user/profile')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.profile.id).toBe('default')
    expect(data.profile.displayName).toBe('TAIA user')
    expect(data.versionId).toBeNull()
  })

  it('returns the latest version content when one exists', async () => {
    mockGetLatestUserProfileVersion.mockResolvedValueOnce({
      id: 'upv_1',
      user_id: 'default',
      content: sampleProfile,
      created_at: '2026-05-06T00:00:00Z',
      created_by: 'admin',
      note: 'first',
    })

    const req = new NextRequest('http://localhost/api/user/profile')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.profile).toEqual(sampleProfile)
    expect(data.versionId).toBe('upv_1')
    expect(data.versionCreatedBy).toBe('admin')
  })
})

describe('PATCH /api/user/profile', () => {
  it('merges partial profile over the latest version and saves', async () => {
    mockGetLatestUserProfileVersion.mockResolvedValueOnce({
      id: 'upv_1',
      user_id: 'default',
      content: sampleProfile,
      created_at: '',
      created_by: null,
      note: null,
    })
    mockSaveUserProfile.mockResolvedValueOnce({ versionId: 'upv_2' })

    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({ profile: { displayName: 'Sam R.' }, note: 'rename' }),
    })
    const res = await PATCH(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.versionId).toBe('upv_2')

    const [userId, merged, opts] = mockSaveUserProfile.mock.calls[0]
    expect(userId).toBe('default')
    expect(merged.displayName).toBe('Sam R.')
    // Other fields preserved.
    expect(merged.facts).toEqual(['likes short answers'])
    expect(merged.preferences).toEqual({ language: 'es' })
    expect(merged.doNotDo).toEqual(['guess when uncertain'])
    expect(opts.note).toBe('rename')
  })

  it('returns 400 when body has no profile', async () => {
    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'oops' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/user/profile/versions', () => {
  it('returns the version list and clamps the limit', async () => {
    mockListUserProfileVersions.mockResolvedValue([])

    const req1 = new NextRequest('http://localhost/api/user/profile/versions?limit=9999')
    await GET_VERSIONS(req1)
    expect(mockListUserProfileVersions).toHaveBeenLastCalledWith('default', 200)

    const req2 = new NextRequest('http://localhost/api/user/profile/versions?limit=abc')
    await GET_VERSIONS(req2)
    expect(mockListUserProfileVersions).toHaveBeenLastCalledWith('default', 50)
  })
})

describe('POST /api/user/profile/versions/[versionId]/restore', () => {
  it('saves a new version with the prior content', async () => {
    mockGetUserProfileVersion.mockResolvedValueOnce({
      id: 'upv_old',
      user_id: 'default',
      content: sampleProfile,
      created_at: '',
      created_by: null,
      note: null,
    })
    mockSaveUserProfile.mockResolvedValueOnce({ versionId: 'upv_new' })

    const req = new NextRequest('http://localhost/api/user/profile/versions/upv_old/restore', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST_RESTORE(req, {
      params: Promise.resolve({ versionId: 'upv_old' }),
    })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.restoredFrom).toBe('upv_old')
    expect(data.versionId).toBe('upv_new')
    expect(data.profile).toEqual(sampleProfile)
  })

  it('404s when the version belongs to another user', async () => {
    mockGetUserProfileVersion.mockResolvedValueOnce({
      id: 'upv_x',
      user_id: 'someone-else',
      content: sampleProfile,
      created_at: '',
      created_by: null,
      note: null,
    })

    const req = new NextRequest('http://localhost/api/user/profile/versions/upv_x/restore', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST_RESTORE(req, {
      params: Promise.resolve({ versionId: 'upv_x' }),
    })
    expect(res.status).toBe(404)
    expect(mockSaveUserProfile).not.toHaveBeenCalled()
  })
})
