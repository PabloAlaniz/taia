import { NextRequest } from 'next/server'
import { apiOk, apiError } from '@taia/core/errors'
import * as cronService from '@taia/core/services/cron.service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params
    const data = await cronService.getCronHistory(agentId)
    return apiOk(data)
  } catch (err) {
    return apiError(err)
  }
}
