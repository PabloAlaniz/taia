import { NextRequest } from 'next/server'
import { apiOk } from '@taia/core/errors'
import { validate } from '@taia/core/validation/validate'
import { CreateCronSchema, UpdateCronSchema } from '@taia/core/validation/schemas'
import * as cronService from '@taia/core/services/cron.service'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { agentId } = await context.params
  const data = await cronService.getCronForAgent(agentId)
  return apiOk(data)
})

export const POST = withErrorBoundary(async (req: NextRequest, context) => {
  const { agentId } = await context.params
  const body = await req.json()
  const input = validate(CreateCronSchema, body)
  const result = await cronService.createCron({
    agentId,
    ...input,
  })
  return apiOk({ created: true, result }, 201)
})

export const PATCH = withErrorBoundary(async (req: NextRequest, context) => {
  const { agentId } = await context.params
  const body = await req.json()
  const input = validate(UpdateCronSchema, body)
  const data = await cronService.updateCron(agentId, input)
  return apiOk(data)
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { agentId } = await context.params
  const data = await cronService.removeCron(agentId)
  return apiOk(data)
})
