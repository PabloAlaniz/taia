// Standardized error classes and API response helpers

import { NextResponse } from 'next/server'

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' not found` : `${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message, 400, 'VALIDATION_ERROR')
  }
}

// Standard API response: success
export function apiOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status })
}

// Standard API response: error
export function apiError(error: unknown, fallbackStatus = 500) {
  if (error instanceof AppError) {
    const body: Record<string, unknown> = {
      ok: false,
      error: error.message,
      code: error.code,
    }
    if (error instanceof ValidationError && error.details) {
      body.details = error.details
    }
    // An error that knows when to come back (a spent rate limit) says so.
    const retryAfter = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds
    const headers =
      typeof retryAfter === 'number' ? { 'Retry-After': String(retryAfter) } : undefined
    return NextResponse.json(body, { status: error.statusCode, headers })
  }

  const message = error instanceof Error ? error.message : 'Internal server error'
  return NextResponse.json({ ok: false, error: message }, { status: fallbackStatus })
}
