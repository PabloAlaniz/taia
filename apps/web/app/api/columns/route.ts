import { NextRequest, NextResponse } from 'next/server'
import { getColumnSettings } from '@taia/core/db'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const settings = await getColumnSettings()

  // Return as a map for easier lookup
  const settingsMap: Record<string, number | null> = {}
  for (const setting of settings) {
    settingsMap[setting.column_name] = setting.wip_limit
  }

  return NextResponse.json({ settings: settingsMap })
}
