import { NextRequest, NextResponse } from 'next/server'
import { getAllTagColors, setTagColor, deleteTagColor } from '@taia/core/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tag-colors
 * Returns all tag color assignments as a map { tag: color }
 */
export async function GET() {
  try {
    const colors = await getAllTagColors()
    return NextResponse.json({ ok: true, colors })
  } catch (error: unknown) {
    // If the tag_colors table doesn't exist yet (migration not run), return empty
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('relation') && msg.includes('does not exist')) {
      return NextResponse.json({ ok: true, colors: {} })
    }
    console.error('Error fetching tag colors:', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch tag colors' }, { status: 500 })
  }
}

/**
 * PUT /api/tag-colors
 * Set color for a tag: { tag: string, color: string }
 * Or remove: { tag: string, color: null }
 */
export async function PUT(request: NextRequest) {
  try {
    const { tag, color } = await request.json()

    if (!tag || typeof tag !== 'string') {
      return NextResponse.json({ ok: false, error: 'Tag is required' }, { status: 400 })
    }

    if (color === null) {
      await deleteTagColor(tag)
    } else {
      if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return NextResponse.json(
          { ok: false, error: 'Color must be a valid hex color (e.g. #EF4444)' },
          { status: 400 },
        )
      }
      await setTagColor(tag, color)
    }

    const colors = await getAllTagColors()
    return NextResponse.json({ ok: true, colors })
  } catch (error) {
    console.error('Error updating tag color:', error)
    return NextResponse.json({ ok: false, error: 'Failed to update tag color' }, { status: 500 })
  }
}
