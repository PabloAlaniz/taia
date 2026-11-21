// Route handler decorator — separates error handling from business logic (SRP)
// Usage: export const GET = withErrorBoundary(async (req, ctx) => { ... });

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from './errors'

/** Standard Next.js route handler signature with async params (Next.js 15) */
type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>

/**
 * Decorator that wraps a route handler with an error boundary.
 * Catches any thrown error and formats it via apiError().
 *
 * This eliminates the repeated try/catch → apiError boilerplate
 * from 50+ route handlers across the codebase.
 */
export function withErrorBoundary(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      return await handler(req, context)
    } catch (error) {
      return apiError(error)
    }
  }
}

/**
 * Compose multiple decorators for routes that need additional
 * cross-cutting concerns (e.g., auth, rate-limit, logging).
 *
 * Usage: export const GET = compose(withAuth, withErrorBoundary)(handler);
 */
export function compose(...decorators: Array<(h: RouteHandler) => RouteHandler>) {
  return (handler: RouteHandler): RouteHandler =>
    decorators.reduceRight((h, decorator) => decorator(h), handler)
}

/**
 * The workspace a request is about: an explicit value (query or body) first,
 * then the `x-workspace-id` header the web client sends with every call.
 * Undefined means "no workspace": lists cover all of them and new records go
 * to the default one.
 */
export function requestWorkspaceId(req: Request, explicit?: string | null): string | undefined {
  return explicit?.trim() || req.headers.get('x-workspace-id')?.trim() || undefined
}
