import { describe, it, expect, vi } from 'vitest'

const health = {
  ok: true,
  state: 'connected',
  configured: true,
  provider: 'openclaw',
  instances: [
    {
      instanceId: 'openclaw',
      provider: 'openclaw',
      label: 'openclaw',
      isDefault: true,
      state: 'connected',
      url: 'http://gw:18789',
    },
  ],
}

// The aggregation is covered in core (runtime-health.service.test.ts).
vi.mock('@taia/core/services/runtime-health.service', () => ({
  getRuntimeHealth: async () => health,
}))

import { GET } from '@/app/api/runtime/health/route'
import { GET as LEGACY_GET } from '@/app/api/gateway/health/route'

describe('GET /api/runtime/health', () => {
  it('returns the health of every runtime instance', async () => {
    expect(await (await GET()).json()).toEqual(health)
  })

  it('keeps the legacy alias', async () => {
    expect(await (await LEGACY_GET()).json()).toEqual(health)
  })
})
