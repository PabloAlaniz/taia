import { NextRequest } from 'next/server'
import { apiOk, apiError } from '@taia/core/errors'
import * as cronService from '@taia/core/services/cron.service'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params
    const data = await cronService.triggerCronRun(agentId)
    return apiOk(data)
  } catch (err) {
    return apiError(err)
  }
}
