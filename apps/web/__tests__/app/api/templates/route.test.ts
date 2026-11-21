import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/templates/route'

const mockGetAllTemplates = vi.fn()
const mockCreateTemplate = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAllTemplates: (...args: any[]) => mockGetAllTemplates(...args),
  createTemplate: (...args: any[]) => mockCreateTemplate(...args),
}))

const SAMPLE_TEMPLATES = [
  {
    id: 'tpl-bug',
    name: 'Bug Report',
    description: 'Steps to reproduce...',
    default_status: 'INBOX',
    default_priority: 'HIGH',
    default_tags: ['bug'],
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tpl-feat',
    name: 'Feature Request',
    description: 'As a user...',
    default_status: 'IDEA',
    default_priority: 'MEDIUM',
    default_tags: ['feature'],
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAllTemplates.mockResolvedValue(SAMPLE_TEMPLATES)
})

describe('GET /api/templates', () => {
  it('lists every workspace when none is given', async () => {
    mockGetAllTemplates.mockResolvedValue([])

    await GET(new NextRequest('http://localhost/api/templates'), { params: Promise.resolve({}) })

    expect(mockGetAllTemplates).toHaveBeenLastCalledWith(undefined)
  })

  it('scopes the list to the x-workspace-id header', async () => {
    mockGetAllTemplates.mockResolvedValue([])

    await GET(
      new NextRequest('http://localhost/api/templates', { headers: { 'x-workspace-id': 'ws-a' } }),
      { params: Promise.resolve({}) },
    )

    expect(mockGetAllTemplates).toHaveBeenLastCalledWith('ws-a')
  })

  it('prefers the workspace_id query parameter over the header', async () => {
    mockGetAllTemplates.mockResolvedValue([])

    await GET(
      new NextRequest('http://localhost/api/templates?workspace_id=ws-b', {
        headers: { 'x-workspace-id': 'ws-a' },
      }),
      { params: Promise.resolve({}) },
    )

    expect(mockGetAllTemplates).toHaveBeenLastCalledWith('ws-b')
  })

  it('returns all templates', async () => {
    const res = await GET(new NextRequest('http://localhost/api/templates'), {
      params: Promise.resolve({}),
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.templates).toHaveLength(2)
    expect(data.templates[0].name).toBe('Bug Report')
  })
})

describe('POST /api/templates', () => {
  it('creates a new template', async () => {
    const newTemplate = {
      id: 'tpl-new',
      name: 'New Template',
      description: 'Test',
      default_status: 'INBOX',
      default_priority: 'MEDIUM',
      default_tags: [],
      is_default: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockCreateTemplate.mockResolvedValue(newTemplate)

    const req = new NextRequest('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Template', description: 'Test' }),
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.template.name).toBe('New Template')
  })

  it('validates required name', async () => {
    const req = new NextRequest('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ description: 'Missing name' }),
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
  })
})
