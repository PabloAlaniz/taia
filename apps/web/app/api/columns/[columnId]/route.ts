import { NextRequest, NextResponse } from 'next/server'
import { setColumnWipLimit, deleteColumnSetting, getColumnSetting } from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { SetWipLimitSchema } from '@taia/core/validation/schemas'
import { apiOk, apiError } from '@taia/core/errors'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> },
) {
  const { columnId } = await params
  const setting = await getColumnSetting(columnId)

  if (!setting) {
    return NextResponse.json({ column_name: columnId, wip_limit: null })
  }

  return NextResponse.json(setting)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> },
) {
  try {
    const { columnId } = await params
    const body = await request.json()
    const data = validate(SetWipLimitSchema, body)
    const setting = await setColumnWipLimit(columnId, data.wip_limit)
    return apiOk({ setting })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> },
) {
  const { columnId } = await params
  const deleted = await deleteColumnSetting(columnId)
  return NextResponse.json({ ok: deleted })
}
