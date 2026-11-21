import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { AgentIdentity } from '@taia/types'

// --- Mocks ---
//
// The context routes are thin handlers over @taia/core/db and
// @taia/core/services/agent-context.service. We stub both so the tests can
// assert request/response shape without touching Postgres.

const mockGetAgentById = vi.fn()
const mockGetAgentContext = vi.fn()
const mockGetAgentIdentityVersion = vi.fn()
const mockListAgentIdentityVersions = vi.fn()

const mockUpdateAgentIdentity = vi.fn()
const mockRestoreAgentIdentity = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAgentById: (...args: unknown[]) => mockGetAgentById(...args),
  getAgentContext: (...args: unknown[]) => mockGetAgentContext(...args),
  getAgentIdentityVersion: (...args: unknown[]) => mockGetAgentIdentityVersion(...args),
  listAgentIdentityVersions: (...args: unknown[]) => mockListAgentIdentityVersions(...args),
  upsertAgentWorkingState: vi.fn().mockResolvedValue({}),
}))

vi.mock('@taia/core/services/agent-context.service', () => ({
  updateAgentIdentity: (...args: unknown[]) => mockUpdateAgentIdentity(...args),
  restoreAgentIdentity: (...args: unknown[]) => mockRestoreAgentIdentity(...args),
}))

import { GET, PATCH } from '@/app/api/agents/[agentId]/context/route'
import { GET as GET_VERSIONS } from '@/app/api/agents/[agentId]/context/versions/route'
import { POST as POST_RESTORE } from '@/app/api/agents/[agentId]/context/versions/[versionId]/restore/route'

const sampleIdentity: AgentIdentity = {
  id: 'alex',
  name: 'Alex',
  role: 'Reviewer',
  persona: 'careful',
  instructions: 'always test',
  capabilities: ['read_tasks'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agents/[agentId]/context', () => {
  it('404s when the agent does not exist', async () => {
    mockGetAgentById.mockResolvedValueOnce(undefined)
    const req = new NextRequest('http://localhost/api/agents/ghost/context')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'ghost' }) })
    expect(res.status).toBe(404)
  })

  it('returns identity:null when the agent has no agent_context row yet', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockGetAgentContext.mockResolvedValueOnce(null)
    const req = new NextRequest('http://localhost/api/agents/alex/context')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'alex' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.identity).toBeNull()
    expect(data.versionId).toBeNull()
  })

  it('returns the active identity + version metadata', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockGetAgentContext.mockResolvedValueOnce({
      agent_id: 'alex',
      agent_identity_version_id: 'aiv_1',
      project_context_version_id: null,
      user_profile_version_id: null,
      updated_at: '2026-05-06T00:00:00Z',
    })
    mockGetAgentIdentityVersion.mockResolvedValueOnce({
      id: 'aiv_1',
      agent_id: 'alex',
      content: sampleIdentity,
      created_at: '2026-05-06T00:00:00Z',
      created_by: 'user-1',
      note: 'first save',
    })

    const req = new NextRequest('http://localhost/api/agents/alex/context')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'alex' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.identity).toEqual(sampleIdentity)
    expect(data.versionId).toBe('aiv_1')
    expect(data.versionCreatedBy).toBe('user-1')
    expect(data.versionNote).toBe('first save')
  })
})

describe('PATCH /api/agents/[agentId]/context', () => {
  it('delegates the partial edit to updateAgentIdentity', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex', role: 'Reviewer' })
    mockUpdateAgentIdentity.mockResolvedValueOnce({
      versionId: 'aiv_2',
      identity: { ...sampleIdentity, persona: 'updated persona' },
    })

    const req = new NextRequest('http://localhost/api/agents/alex/context', {
      method: 'PATCH',
      body: JSON.stringify({ identity: { persona: 'updated persona' }, note: 'tweak' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ agentId: 'alex' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ versionId: 'aiv_2', identity: { persona: 'updated persona' } })
    expect(mockUpdateAgentIdentity).toHaveBeenCalledWith(
      'alex',
      { persona: 'updated persona' },
      { createdBy: 'ui:context', note: 'tweak' },
    )
  })

  it('returns 400 when body has no identity', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    const req = new NextRequest('http://localhost/api/agents/alex/context', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'oops' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ agentId: 'alex' }) })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/agents/[agentId]/context/versions', () => {
  it('returns versions ordered by repository (caller passes limit through)', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockListAgentIdentityVersions.mockResolvedValueOnce([
      {
        id: 'aiv_2',
        agent_id: 'alex',
        content: { ...sampleIdentity, persona: 'newer' },
        created_at: '2026-05-06T01:00:00Z',
        created_by: 'user-1',
        note: 'second',
      },
      {
        id: 'aiv_1',
        agent_id: 'alex',
        content: sampleIdentity,
        created_at: '2026-05-06T00:00:00Z',
        created_by: 'system',
        note: 'first',
      },
    ])

    const req = new NextRequest('http://localhost/api/agents/alex/context/versions?limit=10')
    const res = await GET_VERSIONS(req, { params: Promise.resolve({ agentId: 'alex' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.versions).toHaveLength(2)
    expect(data.versions[0].versionId).toBe('aiv_2')
    expect(data.versions[1].versionId).toBe('aiv_1')
    expect(mockListAgentIdentityVersions).toHaveBeenCalledWith('alex', 10)
  })

  it('clamps limit to 200 and defaults to 50 when invalid', async () => {
    mockGetAgentById.mockResolvedValue({ id: 'alex', name: 'Alex' })
    mockListAgentIdentityVersions.mockResolvedValue([])

    const req1 = new NextRequest('http://localhost/api/agents/alex/context/versions?limit=9999')
    await GET_VERSIONS(req1, { params: Promise.resolve({ agentId: 'alex' }) })
    expect(mockListAgentIdentityVersions).toHaveBeenLastCalledWith('alex', 200)

    const req2 = new NextRequest('http://localhost/api/agents/alex/context/versions?limit=abc')
    await GET_VERSIONS(req2, { params: Promise.resolve({ agentId: 'alex' }) })
    expect(mockListAgentIdentityVersions).toHaveBeenLastCalledWith('alex', 50)
  })
})

describe('POST /api/agents/[agentId]/context/versions/[versionId]/restore', () => {
  it('restores through the service and returns the restored identity', async () => {
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockRestoreAgentIdentity.mockResolvedValueOnce({
      versionId: 'aiv_new',
      identity: sampleIdentity,
    })

    const req = new NextRequest(
      'http://localhost/api/agents/alex/context/versions/aiv_old/restore',
      { method: 'POST', body: '{}' },
    )
    const res = await POST_RESTORE(req, {
      params: Promise.resolve({ agentId: 'alex', versionId: 'aiv_old' }),
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({
      restoredFrom: 'aiv_old',
      versionId: 'aiv_new',
      identity: sampleIdentity,
    })
    expect(mockRestoreAgentIdentity).toHaveBeenCalledWith('alex', 'aiv_old', {
      createdBy: 'ui:restore',
    })
  })

  it('404s when the version does not belong to this agent', async () => {
    const { NotFoundError } = await import('@taia/core/errors')
    mockGetAgentById.mockResolvedValueOnce({ id: 'alex', name: 'Alex' })
    mockRestoreAgentIdentity.mockRejectedValueOnce(
      new NotFoundError('Agent identity version', 'aiv_x'),
    )

    const req = new NextRequest('http://localhost/api/agents/alex/context/versions/aiv_x/restore', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST_RESTORE(req, {
      params: Promise.resolve({ agentId: 'alex', versionId: 'aiv_x' }),
    })
    expect(res.status).toBe(404)
  })
})
