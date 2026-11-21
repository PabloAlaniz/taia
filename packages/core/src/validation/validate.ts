// Validation helper — parses input with Zod and throws ValidationError on failure

import { z } from 'zod'
import { ValidationError } from '../errors'

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)

  if (!result.success) {
    const details: Record<string, string[]> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_root'
      if (!details[path]) details[path] = []
      details[path].push(issue.message)
    }

    const firstMessage = result.error.issues[0]?.message || 'Validation failed'
    throw new ValidationError(firstMessage, details)
  }

  return result.data
}
