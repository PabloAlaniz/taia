import { NextRequest, NextResponse } from 'next/server'
import {
  cleanupSettingsAuditEvents,
  listSettingsAuditEvents,
  type SettingsAuditOperation,
} from '@taia/core/services/settings-audit.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspace_id')
    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: 'workspace_id required' }, { status: 400 })
    }

    const result = await listSettingsAuditEvents({
      workspaceId,
      operation: (searchParams.get('operation') || undefined) as SettingsAuditOperation | undefined,
      resourceType: (searchParams.get('resource_type') || undefined) as
        | 'setting'
        | 'api_key'
        | undefined,
      settingKey: searchParams.get('setting_key') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.workspace_id || typeof body.workspace_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'workspace_id required' }, { status: 400 })
    }

    const result = await cleanupSettingsAuditEvents({
      workspaceId: body.workspace_id,
      retentionDays: typeof body.retention_days === 'number' ? body.retention_days : undefined,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
