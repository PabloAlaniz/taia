import { NextRequest } from 'next/server'
import { apiOk, apiError } from '@taia/core/errors'
import { syncAllCosts, syncAgentCosts } from '@taia/core/services/cost.service'

export async function POST(request: NextRequest) {
  try {
    let agentId: string | undefined
    try {
      const body = await request.json()
      agentId = body?.agentId
    } catch {
      // Empty body is fine — sync all
    }

    const result = agentId ? await syncAgentCosts(agentId) : await syncAllCosts()

    return apiOk({ ...result })
  } catch (err) {
    return apiError(err)
  }
}
