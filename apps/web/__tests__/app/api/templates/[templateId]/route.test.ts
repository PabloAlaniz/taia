import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetTemplateById = vi.fn()
const mockUpdateTemplate = vi.fn()
const mockDeleteTemplate = vi.fn()

vi.mock('@taia/core/db', () => ({
  getTemplateById: (...args: any[]) => mockGetTemplateById(...args),
  updateTemplate: (...args: any[]) => mockUpdateTemplate(...args),
  deleteTemplate: (...args: any[]) => mockDeleteTemplate(...args),
}))

import { GET, PUT, DELETE } from '@/app/api/templates/[templateId]/route'

beforeEach(() => vi.clearAllMocks())

const makeParams = (templateId: string) => ({
  params: Promise.resolve({ templateId }),
})

const mockTemplate = {
  id: 't1',
  name: 'Bug Report',
  description: 'Template for bug reports',
  default_priority: 'HIGH',
  default_tags: ['bug'],
  task_description_template: 'Steps to reproduce:\n1.\n2.\n3.',
}

describe('GET /api/templates/[templateId]', () => {
  it('returns template by id', async () => {
    mockGetTemplateById.mockResolvedValue(mockTemplate)

    const req = new NextRequest('http://localhost/api/templates/t1')
    const res = await GET(req, makeParams('t1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.template.name).toBe('Bug Report')
  })

  it('returns 404 when template not found', async () => {
    mockGetTemplateById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/templates/nope')
    const res = await GET(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/templates/[templateId]', () => {
  it('updates a template', async () => {
    const updated = { ...mockTemplate, name: 'Updated Template' }
    mockUpdateTemplate.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/templates/t1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Template' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('t1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.template.name).toBe('Updated Template')
  })

  it('returns 404 when template to update not found', async () => {
    mockUpdateTemplate.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/templates/nope', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })

  it('passes validated data to updateTemplate', async () => {
    mockUpdateTemplate.mockResolvedValue(mockTemplate)

    const req = new NextRequest('http://localhost/api/templates/t1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name', default_priority: 'LOW' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(req, makeParams('t1'))

    expect(mockUpdateTemplate).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ name: 'New Name' }),
    )
  })
})

describe('DELETE /api/templates/[templateId]', () => {
  it('deletes a template', async () => {
    mockDeleteTemplate.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/templates/t1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('t1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.deleted).toBe(true)
  })

  it('returns 404 when template to delete not found', async () => {
    mockDeleteTemplate.mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/templates/nope', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('nope'))

    expect(res.status).toBe(404)
  })
})
