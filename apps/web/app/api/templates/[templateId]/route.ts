import { NextRequest } from 'next/server'
import { getTemplateById, updateTemplate, deleteTemplate } from '@taia/core/db'
import { validate } from '@taia/core/validation/validate'
import { UpdateTemplateSchema } from '@taia/core/validation/schemas'
import { apiOk, NotFoundError } from '@taia/core/errors'
import { withErrorBoundary } from '@taia/core/api-handler'

export const GET = withErrorBoundary(async (_req: NextRequest, context) => {
  const { templateId } = await context.params
  const template = await getTemplateById(templateId)
  if (!template) throw new NotFoundError('Template', templateId)
  return apiOk({ template })
})

export const PUT = withErrorBoundary(async (req: NextRequest, context) => {
  const { templateId } = await context.params
  const body = await req.json()
  const updates = validate(UpdateTemplateSchema, body)
  const template = await updateTemplate(templateId, updates)
  if (!template) throw new NotFoundError('Template', templateId)
  return apiOk({ template })
})

export const DELETE = withErrorBoundary(async (_req: NextRequest, context) => {
  const { templateId } = await context.params
  const success = await deleteTemplate(templateId)
  if (!success) throw new NotFoundError('Template', templateId)
  return apiOk({ deleted: true })
})
