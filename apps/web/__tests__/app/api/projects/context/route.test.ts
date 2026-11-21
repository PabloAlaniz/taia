import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ProjectContext } from '@taia/types'

// --- Mocks ---

const mockGetProjectByIdFull = vi.fn()
const mockGetLatestProjectContextVersion = vi.fn()
const mockListProjectContextVersions = vi.fn()
const mockGetProjectContextVersion = vi.fn()
const mockSaveProjectContext = vi.fn()

vi.mock('@taia/core/db', () => ({
  getProjectByIdFull: (...args: unknown[]) => mockGetProjectByIdFull(...args),
  getLatestProjectContextVersion: (...args: unknown[]) =>
    mockGetLatestProjectContextVersion(...args),
  listProjectContextVersions: (...args: unknown[]) => mockListProjectContextVersions(...args),
  getProjectContextVersion: (...args: unknown[]) => mockGetProjectContextVersion(...args),
}))

vi.mock('@taia/core/services/agent-context.service', () => ({
  saveProjectContext: (...args: unknown[]) => mockSaveProjectContext(...args),
}))

import { GET, PATCH } from '@/app/api/projects/[projectId]/context/route'
import { GET as GET_VERSIONS } from '@/app/api/projects/[projectId]/context/versions/route'
import { POST as POST_RESTORE } from '@/app/api/projects/[projectId]/context/versions/[versionId]/restore/route'

const sampleContext: ProjectContext = {
  id: 'p-1',
  name: 'Acme',
  description: 'Acme product',
  glossary: { sla: 'service level agreement' },
  knowledgeRefs: [{ kind: 'doc', uri: 'docs/policy.md', description: 'policy', cacheable: true }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/projects/[projectId]/context', () => {
  it('404s when the project does not exist', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce(undefined)
    const req = new NextRequest('http://localhost/api/projects/missing/context')
    const res = await GET(req, { params: Promise.resolve({ projectId: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns the latest version content when one exists', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce({
      id: 'p-1',
      name: 'Acme',
      description: 'desc',
    })
    mockGetLatestProjectContextVersion.mockResolvedValueOnce({
      id: 'pcv_1',
      project_id: 'p-1',
      content: sampleContext,
      created_at: '2026-05-06T00:00:00Z',
      created_by: 'admin',
      note: 'first',
    })

    const req = new NextRequest('http://localhost/api/projects/p-1/context')
    const res = await GET(req, { params: Promise.resolve({ projectId: 'p-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.context).toEqual(sampleContext)
    expect(data.versionId).toBe('pcv_1')
    expect(data.versionCreatedBy).toBe('admin')
  })

  it('derives a context from the projects row when no version exists yet', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce({
      id: 'p-1',
      name: 'Acme',
      description: 'derived desc',
      glossary: { sla: 'service level agreement' },
      knowledge_refs: null,
    })
    mockGetLatestProjectContextVersion.mockResolvedValueOnce(null)

    const req = new NextRequest('http://localhost/api/projects/p-1/context')
    const res = await GET(req, { params: Promise.resolve({ projectId: 'p-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.versionId).toBeNull()
    expect(data.context.name).toBe('Acme')
    expect(data.context.description).toBe('derived desc')
    expect(data.context.glossary).toEqual({ sla: 'service level agreement' })
  })
})

describe('PATCH /api/projects/[projectId]/context', () => {
  it('merges partial context over the latest version and saves', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce({
      id: 'p-1',
      name: 'Acme',
      description: 'old desc',
    })
    mockGetLatestProjectContextVersion.mockResolvedValueOnce({
      id: 'pcv_1',
      project_id: 'p-1',
      content: sampleContext,
      created_at: '',
      created_by: null,
      note: null,
    })
    mockSaveProjectContext.mockResolvedValueOnce({ versionId: 'pcv_2' })

    const req = new NextRequest('http://localhost/api/projects/p-1/context', {
      method: 'PATCH',
      body: JSON.stringify({
        context: { description: 'new desc' },
        note: 'tweak',
      }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ projectId: 'p-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.versionId).toBe('pcv_2')

    const [, merged, opts] = mockSaveProjectContext.mock.calls[0]
    expect(merged.description).toBe('new desc')
    expect(merged.glossary).toEqual(sampleContext.glossary) // preserved
    expect(merged.knowledgeRefs).toEqual(sampleContext.knowledgeRefs)
    expect(opts.note).toBe('tweak')
  })

  it('returns 400 when body has no context', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce({
      id: 'p-1',
      name: 'Acme',
      description: '',
    })
    const req = new NextRequest('http://localhost/api/projects/p-1/context', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'oops' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ projectId: 'p-1' }) })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/projects/[projectId]/context/versions', () => {
  it('returns the version list with limit clamping', async () => {
    mockGetProjectByIdFull.mockResolvedValue({ id: 'p-1', name: 'Acme', description: '' })
    mockListProjectContextVersions.mockResolvedValue([])

    const req1 = new NextRequest('http://localhost/api/projects/p-1/context/versions?limit=9999')
    await GET_VERSIONS(req1, { params: Promise.resolve({ projectId: 'p-1' }) })
    expect(mockListProjectContextVersions).toHaveBeenLastCalledWith('p-1', 200)

    const req2 = new NextRequest('http://localhost/api/projects/p-1/context/versions?limit=abc')
    await GET_VERSIONS(req2, { params: Promise.resolve({ projectId: 'p-1' }) })
    expect(mockListProjectContextVersions).toHaveBeenLastCalledWith('p-1', 50)
  })
})

describe('POST /api/projects/[projectId]/context/versions/[versionId]/restore', () => {
  it('saves a new version with the prior content', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce({ id: 'p-1', name: 'Acme', description: '' })
    mockGetProjectContextVersion.mockResolvedValueOnce({
      id: 'pcv_old',
      project_id: 'p-1',
      content: sampleContext,
      created_at: '',
      created_by: null,
      note: null,
    })
    mockSaveProjectContext.mockResolvedValueOnce({ versionId: 'pcv_new' })

    const req = new NextRequest(
      'http://localhost/api/projects/p-1/context/versions/pcv_old/restore',
      { method: 'POST', body: '{}' },
    )
    const res = await POST_RESTORE(req, {
      params: Promise.resolve({ projectId: 'p-1', versionId: 'pcv_old' }),
    })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.restoredFrom).toBe('pcv_old')
    expect(data.versionId).toBe('pcv_new')
    expect(data.context).toEqual(sampleContext)

    const [projectId, content, opts] = mockSaveProjectContext.mock.calls[0]
    expect(projectId).toBe('p-1')
    expect(content).toEqual(sampleContext)
    expect(opts.note).toContain('pcv_old')
  })

  it('404s when the version belongs to another project', async () => {
    mockGetProjectByIdFull.mockResolvedValueOnce({ id: 'p-1', name: 'Acme', description: '' })
    mockGetProjectContextVersion.mockResolvedValueOnce({
      id: 'pcv_x',
      project_id: 'p-OTHER',
      content: sampleContext,
      created_at: '',
      created_by: null,
      note: null,
    })

    const req = new NextRequest(
      'http://localhost/api/projects/p-1/context/versions/pcv_x/restore',
      { method: 'POST', body: '{}' },
    )
    const res = await POST_RESTORE(req, {
      params: Promise.resolve({ projectId: 'p-1', versionId: 'pcv_x' }),
    })
    expect(res.status).toBe(404)
    expect(mockSaveProjectContext).not.toHaveBeenCalled()
  })
})
