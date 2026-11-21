import { NextRequest, NextResponse } from 'next/server'
import { getDefaultRuntimeAdapter, getRuntimeAdapter } from '@taia/core/runtime'
import { RuntimeCapability } from '@taia/runtime'
import { apiError } from '@taia/core/errors'

export const dynamic = 'force-dynamic'

/** The adapter of `?instance=`, else the default instance's. */
function adapterFor(request: NextRequest) {
  const instanceId = request.nextUrl.searchParams.get('instance')
  return instanceId ? getRuntimeAdapter(instanceId) : getDefaultRuntimeAdapter()
}

/** GET /api/gateway/config?instance= — an instance's native config document, as-is */
export async function GET(request: NextRequest) {
  try {
    const adapter = await adapterFor(request)
    if (!adapter.capabilities.has(RuntimeCapability.NativeConfig) || !adapter.getNativeConfig) {
      return NextResponse.json({ ok: false, error: 'Runtime does not expose config' })
    }
    const { document, revision } = await adapter.getNativeConfig()
    return NextResponse.json({ ok: true, config: document, hash: revision })
  } catch (error) {
    return apiError(error)
  }
}

/**
 * PATCH /api/gateway/config?instance= — merge-patch an instance's native config.
 * `baseHash` is the revision from GET, used as a write precondition.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { patch, baseHash } = await request.json()
    if (!patch || typeof patch !== 'object') {
      return NextResponse.json({ ok: false, error: 'Missing patch object' }, { status: 400 })
    }

    const adapter = await adapterFor(request)
    if (!adapter.capabilities.has(RuntimeCapability.NativeConfig) || !adapter.patchNativeConfig) {
      return NextResponse.json(
        { ok: false, error: 'Runtime does not allow config writes' },
        { status: 400 },
      )
    }
    const result = await adapter.patchNativeConfig(patch, baseHash)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return apiError(error)
  }
}
