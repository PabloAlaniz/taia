import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@taia/core/db', () => ({
  getAllTagColors: vi.fn(() => ({
    bug: '#EF4444',
    feature: '#3B82F6',
    frontend: '#8B5CF6',
  })),
  setTagColor: vi.fn(),
  deleteTagColor: vi.fn(),
}))

import { GET, PUT } from '@/app/api/tag-colors/route'

describe('/api/tag-colors', () => {
  describe('GET', () => {
    it('returns all tag colors', async () => {
      const res = await GET()
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.colors).toEqual({
        bug: '#EF4444',
        feature: '#3B82F6',
        frontend: '#8B5CF6',
      })
    })
  })

  describe('PUT', () => {
    it('sets a tag color', async () => {
      const req = new NextRequest('http://localhost/api/tag-colors', {
        method: 'PUT',
        body: JSON.stringify({ tag: 'bug', color: '#DC2626' }),
      })

      const res = await PUT(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it('rejects missing tag', async () => {
      const req = new NextRequest('http://localhost/api/tag-colors', {
        method: 'PUT',
        body: JSON.stringify({ color: '#DC2626' }),
      })

      const res = await PUT(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
    })

    it('rejects invalid hex color', async () => {
      const req = new NextRequest('http://localhost/api/tag-colors', {
        method: 'PUT',
        body: JSON.stringify({ tag: 'bug', color: 'not-a-color' }),
      })

      const res = await PUT(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toContain('hex color')
    })

    it('allows null color to remove assignment', async () => {
      const req = new NextRequest('http://localhost/api/tag-colors', {
        method: 'PUT',
        body: JSON.stringify({ tag: 'bug', color: null }),
      })

      const res = await PUT(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })
})
