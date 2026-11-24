import { NextRequest } from 'next/server'
import { actorFromPrincipal, PRINCIPAL_HEADER } from '@taia/core/access/authenticate'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk, ValidationError } from '@taia/core/errors'
import { createAccessToken, listAccessTokens } from '@taia/core/services/access-token.service'

export const dynamic = 'force-dynamic'

// The proxy only lets admin-scoped callers reach /api/access/*.

/** GET /api/access/tokens — every token, without its secret. */
export const GET = withErrorBoundary(async () => {
  return apiOk({ tokens: await listAccessTokens() })
})

/**
 * POST /api/access/tokens  { name, scope: 'admin'|'agent', expiresInDays: 30|90|365|null }
 * Answers the full token once; TAIA only keeps its hash.
 */
export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') throw new ValidationError('JSON body required')
  const { token, record } = await createAccessToken(body, {
    actor: actorFromPrincipal(req.headers.get(PRINCIPAL_HEADER)),
    workspaceId: req.headers.get('x-workspace-id') || undefined,
  })
  return apiOk({ token, record }, 201)
})
