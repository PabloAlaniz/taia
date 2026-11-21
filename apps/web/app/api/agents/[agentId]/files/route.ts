import { NextRequest, NextResponse } from 'next/server'
import { RuntimeCapability } from '@taia/runtime'
import { getAgentWorkingState, listAgentMemories, upsertAgentWorkingState } from '@taia/core/db'
import { getRuntimeAdapterForAgent } from '@taia/core/runtime'
import { loadAgentContextBundle } from '@taia/core/services/context.service'

const MEMORY_PREFIX = '/memories/'

// Files rendered from the typed identity; they are edited through /context.
const RENDERED_FILES = ['SOUL.md', 'HEARTBEAT.md', 'IDENTITY.md', 'AGENTS.md', 'USER.md']

/**
 * The agent's context as files, for agents that read it over HTTP. The
 * files are what the agent's runtime renders from the context bundle
 * (ADR-005), plus WORKING.md (its working state) and its memory file names.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  const [bundle, adapter, working, memories] = await Promise.all([
    loadAgentContextBundle(agentId),
    getRuntimeAdapterForAgent(agentId),
    getAgentWorkingState(agentId),
    listAgentMemories(agentId, { pathPrefix: MEMORY_PREFIX }),
  ])

  const files: Record<string, string> = {}
  if (bundle && adapter.capabilities.has(RuntimeCapability.ContextSync)) {
    for (const file of adapter.projectAgentContext?.(bundle).files ?? []) {
      files[file.path] = file.content
    }
  }
  files['WORKING.md'] = working?.content ?? ''
  // Plain file names, as the memory route expects them (`/memory/<name>`).
  const memoryFiles = memories.map((m) => m.path.slice(MEMORY_PREFIX.length))

  return NextResponse.json({ agentId, files, memoryFiles })
}

/** Only WORKING.md is writable here; the rendered files come from /context. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  const body = await request.json()
  const { filename, content } = body

  if (RENDERED_FILES.includes(filename)) {
    return NextResponse.json(
      {
        error: `${filename} is rendered from the agent identity. Edit it with PATCH /api/agents/${agentId}/context.`,
      },
      { status: 409 },
    )
  }
  if (filename !== 'WORKING.md') {
    return NextResponse.json({ error: 'File not allowed. Allowed: WORKING.md' }, { status: 400 })
  }

  try {
    await upsertAgentWorkingState(agentId, content, { updatedBy: 'ui:files' })
    return NextResponse.json({ success: true, agentId, filename })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to write file', details: String(err) },
      { status: 500 },
    )
  }
}
