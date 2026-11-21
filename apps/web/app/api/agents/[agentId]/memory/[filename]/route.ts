import { NextRequest, NextResponse } from 'next/server'
import { getAgentMemory, upsertAgentMemory } from '@taia/core/db'

// Memory files live in agent_memory under /memories/<filename>, the same store
// the Anthropic memory tool uses (ADR-005).
const memoryPath = (filename: string) => `/memories/${filename}`

// OpenClaw v2026.4.10+ deprecated lowercase `memory.md` as a canonical name.
// Reject the lowercase form so our agent memory stays aligned with the uppercase convention.
function validateFilename(filename: string): string | null {
  if (!filename.endsWith('.md') || filename.includes('..') || filename.includes('/')) {
    return 'Invalid filename'
  }
  if (filename.toLowerCase() === 'memory.md' && filename !== 'MEMORY.md') {
    return 'Use MEMORY.md (uppercase) — lowercase memory.md is deprecated'
  }
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; filename: string }> },
) {
  const { agentId, filename } = await params

  const invalid = validateFilename(filename)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }

  const memory = await getAgentMemory(agentId, memoryPath(filename))

  if (!memory) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return NextResponse.json({ agentId, filename, content: memory.content })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; filename: string }> },
) {
  const { agentId, filename } = await params

  const invalid = validateFilename(filename)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }

  const body = await request.json()
  const { content } = body

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'Content must be a string' }, { status: 400 })
  }

  try {
    await upsertAgentMemory(agentId, memoryPath(filename), content)
    return NextResponse.json({ success: true, agentId, filename })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to write file', details: String(err) },
      { status: 500 },
    )
  }
}
