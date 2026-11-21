import { NextRequest, NextResponse } from 'next/server'
import {
  runIncrementalGitHubIssueSync,
  syncGitHubIssues,
} from '@taia/core/services/github-import.service'
import { apiError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

function workspaceIdFrom(request: NextRequest, body: Record<string, unknown>): string | undefined {
  const header = request.headers.get('x-workspace-id') || undefined
  return (body.workspace_id as string | undefined) || header
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const workspace_id = workspaceIdFrom(request, body)
    if (!workspace_id) {
      return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
    }
    if (!body.repository?.owner || !body.repository?.name) {
      return NextResponse.json(
        { error: 'repository.owner and repository.name are required' },
        { status: 400 },
      )
    }
    if (!Array.isArray(body.issues)) {
      return NextResponse.json({ error: 'issues array is required' }, { status: 400 })
    }

    const syncInput = {
      workspace_id,
      repository: body.repository,
      issues: body.issues,
      dryRun: body.dryRun ?? body.dry_run ?? true,
      created_by: body.created_by || 'web-ui',
      project: body.project,
      project_id: body.project_id,
      default_status: body.default_status,
      default_priority: body.default_priority,
    }

    const result =
      body.incremental || body.mode === 'incremental' || body.persistCursor || body.persist_cursor
        ? await runIncrementalGitHubIssueSync({
            ...syncInput,
            cursor: body.cursor ?? body.since ?? null,
            maxAttempts: body.maxAttempts ?? body.max_attempts,
            lockTtlMs: body.lockTtlMs ?? body.lock_ttl_ms,
          })
        : await syncGitHubIssues(syncInput)

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return apiError(error)
  }
}
