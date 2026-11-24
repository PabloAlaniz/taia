import { NextRequest } from 'next/server'
import { actorFromPrincipal, PRINCIPAL_HEADER } from '@taia/core/access/authenticate'
import { withErrorBoundary } from '@taia/core/api-handler'
import { apiOk } from '@taia/core/errors'
import { revokeAccessToken } from '@taia/core/services/access-token.service'

export const dynamic = 'force-dynamic'

/** DELETE /api/access/tokens/:id — revokes the token (the row stays, for the record). */
export const DELETE = withErrorBoundary(async (req: NextRequest, context) => {
  const { tokenId } = await context.params
  const record = await revokeAccessToken(tokenId, {
    actor: actorFromPrincipal(req.headers.get(PRINCIPAL_HEADER)),
    workspaceId: req.headers.get('x-workspace-id') || undefined,
  })
  return apiOk({ record })
})
