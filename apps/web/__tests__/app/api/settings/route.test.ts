import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetSettings = vi.fn()
const mockSetSetting = vi.fn()
const mockDisposeRuntimeAdapter = vi.fn()

vi.mock('@taia/core/db', () => ({
  getSettings: (...args: any[]) => mockGetSettings(...args),
  getSetting: vi.fn(),
  setSetting: (...args: any[]) => mockSetSetting(...args),
}))

const mockApplyProviderSetting = vi.fn()

vi.mock('@taia/core/runtime-instances', () => ({
  applyProviderSetting: (key: string, value: string | null) => mockApplyProviderSetting(key, value),
  getDefaultInstanceConfig: vi.fn(() =>
    Promise.resolve({
      provider: 'openclaw',
      url: 'http://localhost:4000',
      token: 'test-token',
      configured: true,
    }),
  ),
}))

vi.mock('@taia/core/runtime', () => ({
  disposeRuntimeAdapter: (...args: any[]) => mockDisposeRuntimeAdapter(...args),
}))

vi.mock('@taia/core/services/settings-audit.service', () => ({
  isSensitiveSettingKey: (key: string) =>
    key.includes('token') || key.includes('api_key') || key.includes('device_identity'),
  recordSettingsAuditEvent: vi.fn(() => Promise.resolve()),
}))

import { GET, PUT } from '@/app/api/settings/route'

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyProviderSetting.mockResolvedValue(false)
})

describe('GET /api/settings', () => {
  it('returns settings map with masked tokens', async () => {
    mockGetSettings.mockResolvedValue([
      { key: 'openclaw.gateway_url', value: 'http://localhost:4000' },
      { key: 'openclaw.gateway_token', value: 'secret123' },
    ])

    const req = new NextRequest('http://localhost/api/settings')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.settings['openclaw.gateway_url']).toBe('http://localhost:4000')
    expect(data.settings['openclaw.gateway_token']).toBe('********')
    expect(data.configured).toBe(true)
  })

  it('reveals token when requested', async () => {
    mockGetSettings.mockResolvedValue([{ key: 'openclaw.gateway_token', value: 'secret123' }])

    const req = new NextRequest('http://localhost/api/settings?reveal=openclaw.gateway_token')
    const res = await GET(req)
    const data = await res.json()

    expect(data.settings['openclaw.gateway_token']).toBe('secret123')
  })

  it('never reveals runtime device credentials', async () => {
    mockGetSettings.mockResolvedValue([
      { key: 'runtime.providers.openclaw.device_identity', value: '{"privateKeyPem":"x"}' },
      { key: 'runtime.providers.openclaw.device_token.operator', value: '{"token":"t"}' },
    ])

    const req = new NextRequest(
      'http://localhost/api/settings?reveal=runtime.providers.openclaw.device_identity,runtime.providers.openclaw.device_token.operator',
    )
    const data = await (await GET(req)).json()

    expect(data.settings['runtime.providers.openclaw.device_identity']).toBe('********')
    expect(data.settings['runtime.providers.openclaw.device_token.operator']).toBe('********')
  })

  it('passes prefix parameter to getSettings', async () => {
    mockGetSettings.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/settings?prefix=openclaw.')
    await GET(req)

    expect(mockGetSettings).toHaveBeenCalledWith('openclaw.')
  })
})

describe('PUT /api/settings', () => {
  const putSettings = (settings: Record<string, string>) =>
    PUT(
      new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  // Synthetic secret, only for these tests.
  const webhookEndpoint = {
    id: 'n8n',
    url: 'http://192.168.1.20:5678/webhook/taia',
    secret: 'whsec_dGFpYS13ZWJob29rLXNhbGllbnRlLXNpbnRldGljby0wMQ==',
  }

  it('saves well-formed outgoing webhook endpoints', async () => {
    const value = JSON.stringify([webhookEndpoint])

    const res = await putSettings({ 'webhooks.outgoing.ws-1.endpoints': value })

    expect(res.status).toBe(200)
    expect(mockSetSetting).toHaveBeenCalledWith('webhooks.outgoing.ws-1.endpoints', value)
  })

  it.each([
    ['a secret that is not whsec_', [{ ...webhookEndpoint, secret: 'hunter2' }]],
    ['a URL with credentials', [{ ...webhookEndpoint, url: 'https://a:b@hooks.test/' }]],
  ])('refuses outgoing webhook endpoints with %s, saving nothing', async (_name, endpoints) => {
    const res = await putSettings({
      'openclaw.gateway_url': 'http://new-url:4000',
      'webhooks.outgoing.ws-1.endpoints': JSON.stringify(endpoints),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/outgoing webhook endpoint/i)
    expect(mockSetSetting).not.toHaveBeenCalled()
  })

  it('saves settings via setSetting', async () => {
    mockSetSetting.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: {
          'openclaw.gateway_url': 'http://new-url:4000',
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockSetSetting).toHaveBeenCalledWith('openclaw.gateway_url', 'http://new-url:4000')
  })

  it('skips masked token values', async () => {
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: {
          'openclaw.gateway_token': '********',
          'openclaw.gateway_url': 'http://test',
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(req)

    expect(mockSetSetting).not.toHaveBeenCalledWith('openclaw.gateway_token', '********')
    expect(mockSetSetting).toHaveBeenCalledWith('openclaw.gateway_url', 'http://test')
  })

  it('applies provider settings to their instance and disposes the adapters', async () => {
    mockApplyProviderSetting.mockImplementation(async (key: string) => key.startsWith('runtime.'))
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: {
          'runtime.default_provider': 'cursor',
          'runtime.providers.cursor.enabled': 'true',
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(req)

    expect(mockApplyProviderSetting).toHaveBeenCalledWith('runtime.default_provider', 'cursor')
    expect(mockApplyProviderSetting).toHaveBeenCalledWith(
      'runtime.providers.cursor.enabled',
      'true',
    )
    expect(mockDisposeRuntimeAdapter).toHaveBeenCalledTimes(1)
  })

  it('does not dispose runtime adapter for unrelated settings', async () => {
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: {
          'notifications.daily_summary': 'true',
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(req)

    expect(mockDisposeRuntimeAdapter).not.toHaveBeenCalled()
  })

  it('refuses a CLI runtime command outside the policy without writing anything', async () => {
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: { 'runtime.providers.claude-code.command': 'node', other: 'x' },
      }),
    })
    const res = await PUT(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain('TAIA_CLI_COMMAND_CLAUDE_CODE')
    expect(mockSetSetting).not.toHaveBeenCalled()
    expect(mockApplyProviderSetting).not.toHaveBeenCalled()
  })

  it('refuses the worktree setup command unless remote commands are allowed', async () => {
    const put = () =>
      PUT(
        new NextRequest('http://localhost/api/settings', {
          method: 'PUT',
          body: JSON.stringify({ settings: { 'worktree.setup_command': 'pnpm install' } }),
        }),
      )

    const refused = await put()
    expect(refused.status).toBe(400)
    expect((await refused.json()).error).toContain('TAIA_ALLOW_REMOTE_COMMANDS')
    expect(mockSetSetting).not.toHaveBeenCalled()

    process.env.TAIA_ALLOW_REMOTE_COMMANDS = '1'
    try {
      expect((await put()).status).toBe(200)
      expect(mockSetSetting).toHaveBeenCalledWith('worktree.setup_command', 'pnpm install')
    } finally {
      delete process.env.TAIA_ALLOW_REMOTE_COMMANDS
    }
  })

  it.each(['worktree.base_path', 'worktree.repo_clone_path'])(
    'refuses %s unless remote commands are allowed',
    async (key) => {
      const put = () =>
        PUT(
          new NextRequest('http://localhost/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ settings: { [key]: '/etc/cron.d' } }),
          }),
        )

      const refused = await put()
      expect(refused.status).toBe(400)
      expect((await refused.json()).error).toContain('WORKTREE_BASE_PATH')
      expect(mockSetSetting).not.toHaveBeenCalled()

      process.env.TAIA_ALLOW_REMOTE_COMMANDS = '1'
      try {
        expect((await put()).status).toBe(200)
        expect(mockSetSetting).toHaveBeenCalledWith(key, '/etc/cron.d')
      } finally {
        delete process.env.TAIA_ALLOW_REMOTE_COMMANDS
      }
    },
  )

  it("accepts the provider's own binary as a CLI runtime command", async () => {
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: { 'runtime.providers.claude-code.command': '/usr/local/bin/claude' },
      }),
    })
    const res = await PUT(req)

    expect(res.status).toBe(200)
    expect(mockSetSetting).toHaveBeenCalledWith(
      'runtime.providers.claude-code.command',
      '/usr/local/bin/claude',
    )
  })

  it('returns 400 when settings object is missing', async () => {
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req)

    expect(res.status).toBe(400)
  })
})
