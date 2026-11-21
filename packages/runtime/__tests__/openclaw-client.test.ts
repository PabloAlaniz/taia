// OpenClawClient — protocol v4 behaviour over a fake gateway transport.

import crypto from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  OpenClawClient,
  OpenClawConfigConflictError,
  OpenClawFileConflictError,
  OpenClawGatewayError,
  OpenClawPairingRequiredError,
  type OpenClawCredentialStore,
  type OpenClawDeviceIdentity,
} from '@taia/runtime/adapters/openclaw'
import type { GatewayTransport } from '@taia/runtime/adapters/openclaw/client'
import type { GatewayClientOptions } from '@openclaw/gateway-client'

type Handshake =
  | { kind: 'hello'; hello?: Record<string, unknown> }
  | { kind: 'error'; error: Record<string, unknown> }

interface FakeGateway {
  options: GatewayClientOptions
  transport: GatewayTransport
  request: ReturnType<typeof vi.fn>
  emit(event: string, payload: unknown): void
}

function makeClient(opts: {
  handshake?: Handshake
  responses?: Record<string, unknown | ((params: Record<string, unknown>) => unknown)>
  store?: OpenClawCredentialStore
}) {
  const gateways: FakeGateway[] = []
  const client = new OpenClawClient({
    url: 'http://gw:18789',
    token: 'shared-token',
    credentialStore: opts.store,
    createGatewayClient: (options) => {
      const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
        const response = opts.responses?.[method]
        if (response instanceof Error) throw response
        return typeof response === 'function' ? response(params) : (response ?? {})
      })
      const transport: GatewayTransport = {
        start: () => {
          queueMicrotask(() => {
            const handshake = opts.handshake ?? { kind: 'hello' }
            if (handshake.kind === 'hello') {
              options.onHelloOk?.({
                protocol: 4,
                auth: { role: 'operator', scopes: ['operator.read'] },
                snapshot: { uptimeMs: 1234, stateVersion: 7 },
                ...handshake.hello,
              } as never)
            } else {
              options.onConnectError?.(Object.assign(new Error('rejected'), handshake.error))
            }
          })
        },
        stop: vi.fn(),
        request: request as GatewayTransport['request'],
      }
      gateways.push({
        options,
        transport,
        request,
        emit: (event, payload) => options.onEvent?.({ type: 'event', event, payload } as never),
      })
      return transport
    },
  })
  return { client, gateways }
}

function memoryStore(identity: OpenClawDeviceIdentity | null = null): OpenClawCredentialStore & {
  identity: OpenClawDeviceIdentity | null
  tokens: Map<string, { token: string; scopes: string[] }>
} {
  const store = {
    identity,
    tokens: new Map<string, { token: string; scopes: string[] }>(),
    loadIdentity: async () => store.identity,
    saveIdentity: async (id: OpenClawDeviceIdentity) => {
      store.identity = id
    },
    loadDeviceToken: async (role: string) => store.tokens.get(role) ?? null,
    saveDeviceToken: async (role: string, token: { token: string; scopes: string[] }) => {
      store.tokens.set(role, token)
    },
    clearDeviceToken: async (role: string) => {
      store.tokens.delete(role)
    },
  }
  return store
}

describe('OpenClawClient — handshake', () => {
  it('connects with protocol v4, operator scopes and a signed device identity', async () => {
    const store = memoryStore()
    const { client, gateways } = makeClient({ store })

    await client.connect()

    expect(client.getState()).toBe('connected')
    const options = gateways[0].options
    expect(options.url).toBe('ws://gw:18789')
    expect(options.token).toBe('shared-token')
    expect(options).toMatchObject({ minProtocol: 4, maxProtocol: 4, role: 'operator' })
    expect(options.scopes).toContain('operator.admin')

    // Identity is generated once, persisted, and its id is the key fingerprint
    const identity = store.identity!
    expect(options.deviceIdentity).toEqual(identity)
    const raw = crypto
      .createPublicKey(identity.publicKeyPem)
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
    expect(identity.deviceId).toBe(crypto.createHash('sha256').update(raw).digest('hex'))

    // Signatures verify against the public key
    const signature = options.hostDeps!.signDevicePayload!(identity.privateKeyPem, 'payload')
    expect(
      crypto.verify(
        null,
        Buffer.from('payload'),
        crypto.createPublicKey(identity.publicKeyPem),
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true)
    expect(options.hostDeps!.publicKeyRawBase64UrlFromPem!(identity.publicKeyPem)).toBe(
      raw.toString('base64url'),
    )
  })

  it('reuses the stored identity and persists issued device tokens', async () => {
    const existing = memoryStore()
    await makeClient({ store: existing }).client.connect()
    const identity = existing.identity

    const store = memoryStore(identity)
    store.tokens.set('operator', { token: 'old', scopes: [] })
    const { client, gateways } = makeClient({ store })
    await client.connect()

    const deps = gateways[0].options.hostDeps!
    expect(gateways[0].options.deviceIdentity).toEqual(identity)
    expect(await deps.loadDeviceAuthToken!({ deviceId: 'x', role: 'operator' })).toEqual({
      token: 'old',
      scopes: [],
    })
    await deps.storeDeviceAuthToken!({
      deviceId: 'x',
      role: 'operator',
      token: 'new',
      scopes: ['operator.read'],
    })
    expect(store.tokens.get('operator')).toEqual({ token: 'new', scopes: ['operator.read'] })
  })

  it('rejects with a pairing error carrying the request id, and stops', async () => {
    const { client, gateways } = makeClient({
      handshake: {
        kind: 'error',
        error: { details: { code: 'PAIRING_REQUIRED', requestId: 'req-1', deviceId: 'dev-1' } },
      },
    })

    const error = await client.connect().catch((e) => e)

    expect(error).toBeInstanceOf(OpenClawPairingRequiredError)
    expect(error).toMatchObject({ requestId: 'req-1', deviceId: 'dev-1' })
    expect(gateways[0].transport.stop).toHaveBeenCalled()
    expect(client.getState()).toBe('disconnected')
  })

  it('surfaces other connect failures with their gateway code', async () => {
    const { client } = makeClient({
      handshake: { kind: 'error', error: { details: { code: 'AUTH_TOKEN_MISMATCH' } } },
    })
    const error = await client.connect().catch((e) => e)
    expect(error).toBeInstanceOf(OpenClawGatewayError)
    expect(error.code).toBe('AUTH_TOKEN_MISMATCH')
  })

  it('shares one in-flight connection between concurrent callers', async () => {
    const { client, gateways } = makeClient({})
    await Promise.all([client.connect(), client.connect(), client.listAgents()])
    expect(gateways).toHaveLength(1)
  })
})

describe('OpenClawClient — RPCs', () => {
  let fake: ReturnType<typeof makeClient>

  beforeEach(() => {
    fake = makeClient({
      responses: {
        'agents.list': { agents: [{ id: 'main' }] },
        'sessions.list': {
          sessions: [
            { key: 'a', kind: 'direct', sessionId: '1', updatedAt: 1 },
            { key: 'b', kind: 'cron', sessionId: '2', updatedAt: 2 },
          ],
        },
        'chat.history': {
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'toolResult', content: 'x' },
          ],
        },
        'sessions.create': { key: 'agent:main:dashboard:1', runId: 'run-1', runStarted: true },
        'chat.send': { runId: 'run-2', status: 'started' },
        'cron.list': { jobs: [{ id: 'j1', enabled: true, schedule: { kind: 'every' } }] },
        'config.get': { config: { agents: { entries: { main: {} } } }, hash: 'h1' },
        health: { ok: true, agents: [{}, {}] },
      },
    })
  })

  const calls = () => fake.gateways[0].request.mock.calls

  it('lists agents and filters sessions by kind', async () => {
    expect(await fake.client.listAgents()).toEqual([{ id: 'main' }])
    const sessions = await fake.client.listSessions({ kinds: ['direct'], limit: 5 })
    expect(sessions.map((s) => s.key)).toEqual(['a'])
    expect(calls()).toContainEqual(['sessions.list', { limit: 5 }])
  })

  it('reads chat.history and can drop tool messages', async () => {
    const all = await fake.client.getSessionHistory('k', { limit: 10 })
    const visible = await fake.client.getSessionHistory('k', { includeTools: false })
    expect(all).toHaveLength(2)
    expect(visible).toEqual([{ role: 'user', content: 'hi' }])
    expect(calls()).toContainEqual(['chat.history', { sessionKey: 'k', limit: 10 }])
  })

  it('spawns with sessions.create and an idempotency key', async () => {
    const result = await fake.client.spawnSession('do it', {
      agentId: 'main',
      label: 'L',
      model: 'm',
      runTimeoutSeconds: 30,
    })
    expect(result.key).toBe('agent:main:dashboard:1')
    const [, params] = calls().find(([m]) => m === 'sessions.create')!
    expect(params).toMatchObject({
      message: 'do it',
      agentId: 'main',
      label: 'L',
      model: 'm',
      timeoutMs: 30_000,
    })
    expect(params.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('throws when the session was created but its run did not start', async () => {
    fake = makeClient({
      responses: { 'sessions.create': { key: 'k', runStarted: false, runError: 'no model' } },
    })
    await expect(fake.client.spawnSession('x')).rejects.toThrow(/could not start it: no model/)
  })

  it('sends follow-ups with chat.send', async () => {
    await fake.client.sendToSession('k', 'more', 10)
    const [, params] = calls().find(([m]) => m === 'chat.send')!
    expect(params).toMatchObject({ sessionKey: 'k', message: 'more', timeoutMs: 10_000 })
  })

  it('maps cron actions to cron.* and translates add/update to the job schema', async () => {
    await fake.client.cronAction('add', {
      agentId: 'main',
      schedule: { kind: 'cron', expr: '*/15 * * * *', tz: 'UTC' },
      payload: { timeoutSeconds: 120 },
    })
    await fake.client.cronAction('update', { id: 'j1', enabled: false })
    await fake.client.cronAction('remove', { id: 'j1' })
    await fake.client.cronAction('wake', {})

    expect(calls()).toContainEqual([
      'cron.add',
      {
        name: 'taia-heartbeat-main',
        agentId: 'main',
        schedule: { kind: 'cron', expr: '*/15 * * * *', tz: 'UTC' },
        enabled: true,
        sessionTarget: 'isolated',
        wakeMode: 'now',
        payload: { kind: 'agentTurn', message: expect.any(String), timeoutSeconds: 120 },
      },
    ])
    expect(calls()).toContainEqual(['cron.update', { id: 'j1', patch: { enabled: false } }])
    expect(calls()).toContainEqual(['cron.remove', { id: 'j1' }])
    expect(calls()).toContainEqual(['wake', {}])
  })

  it('patches only the timeout on cron update, keeping the job message', async () => {
    await fake.client.cronAction('update', { id: 'j1', payload: { timeoutSeconds: 300 } })
    expect(calls()).toContainEqual([
      'cron.update',
      { id: 'j1', patch: { payload: { kind: 'agentTurn', timeoutSeconds: 300 } } },
    ])
  })

  it('combines health with the hello snapshot', async () => {
    await expect(fake.client.getHealth()).resolves.toEqual({
      ok: true,
      agents: 2,
      uptime: 1234,
      stateVersion: 7,
    })
  })

  it('sends channel messages with the send RPC', async () => {
    await fake.client.sendChannelMessage('telegram', 'u1', 'hola')
    const [, params] = calls().find(([m]) => m === 'send')!
    expect(params).toMatchObject({ channel: 'telegram', to: 'u1', message: 'hola' })
  })

  it('wraps gateway RPC errors', async () => {
    fake = makeClient({
      responses: { 'agents.list': Object.assign(new Error('nope'), { gatewayCode: 'FORBIDDEN' }) },
    })
    await expect(fake.client.listAgents()).rejects.toMatchObject({
      name: 'OpenClawGatewayError',
      code: 'FORBIDDEN',
    })
  })
})

describe('OpenClawClient — agent files', () => {
  it('reads and writes a workspace file with a hash precondition', async () => {
    const hash = 'a'.repeat(64)
    const fake = makeClient({
      responses: {
        'agents.files.get': {
          agentId: 'main',
          workspace: '/w',
          file: { name: 'SOUL.md', path: '/w/SOUL.md', missing: false, hash },
        },
        'agents.files.set': {
          ok: true,
          agentId: 'main',
          workspace: '/w',
          file: { name: 'SOUL.md', path: '/w/SOUL.md', missing: false, hash: 'b'.repeat(64) },
        },
      },
    })

    expect((await fake.client.getAgentFile('main', 'SOUL.md')).hash).toBe(hash)
    const written = await fake.client.setAgentFile('main', 'SOUL.md', '# soul', {
      expectedHash: hash,
    })

    expect(written.hash).toBe('b'.repeat(64))
    expect(fake.gateways[0].request).toHaveBeenCalledWith('agents.files.set', {
      agentId: 'main',
      name: 'SOUL.md',
      content: '# soul',
      expectedHash: hash,
    })
  })

  it('turns a refused write into OpenClawFileConflictError', async () => {
    const fake = makeClient({
      responses: {
        'agents.files.set': Object.assign(new Error('agent file conflict'), {
          details: {
            code: 'INVALID_REQUEST',
            type: 'agent_file_conflict',
            currentHash: 'c'.repeat(64),
          },
        }),
      },
    })

    const err = await fake.client
      .setAgentFile('main', 'SOUL.md', 'x', { expectedMissing: true })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OpenClawFileConflictError)
    expect(err).toMatchObject({ fileName: 'SOUL.md', currentHash: 'c'.repeat(64) })
  })
})

describe('OpenClawClient — agents and config', () => {
  const gatewayError = (message: string) =>
    Object.assign(new Error(message), { details: { code: 'INVALID_REQUEST' } })

  it('creates, updates and deletes agents', async () => {
    const fake = makeClient({
      responses: {
        'agents.create': { ok: true, agentId: 'dev', name: 'dev', workspace: '/w-dev' },
        'agents.update': { ok: true, agentId: 'dev' },
        'agents.delete': { ok: true, agentId: 'dev', removedBindings: 0 },
      },
    })

    expect(await fake.client.createAgent({ name: 'dev', model: 'a/b' })).toMatchObject({
      agentId: 'dev',
    })
    await fake.client.updateAgent({ agentId: 'dev', name: 'Dev' })
    expect(await fake.client.deleteAgent('dev')).toBe(true)

    // agents.create seeds the workspace, so it gets a longer timeout.
    expect(fake.gateways[0].request).toHaveBeenCalledWith(
      'agents.create',
      { name: 'dev', model: 'a/b' },
      { timeoutMs: 60_000 },
    )
    expect(fake.gateways[0].request).toHaveBeenCalledWith('agents.update', {
      agentId: 'dev',
      name: 'Dev',
    })
    expect(fake.gateways[0].request).toHaveBeenCalledWith('agents.delete', {
      agentId: 'dev',
      deleteFiles: false,
    })
  })

  it('treats an existing agent on create and a missing one on delete as outcomes', async () => {
    const fake = makeClient({
      responses: {
        'agents.create': gatewayError('agent "dev" already exists'),
        'agents.delete': gatewayError('agent "dev" not found'),
      },
    })

    expect(await fake.client.createAgent({ name: 'dev' })).toBeNull()
    expect(await fake.client.deleteAgent('dev')).toBe(false)
  })

  it('patches config with replacePaths and maps a stale hash to a conflict', async () => {
    const fake = makeClient({
      responses: { 'config.patch': { ok: true, config: { agents: {} }, hash: 'h2' } },
    })

    const result = await fake.client.configPatch({ agents: {} }, 'h1', [
      'agents.defaults.model.fallbacks',
    ])

    expect(result).toEqual({ config: { agents: {} }, hash: 'h2' })
    expect(fake.gateways[0].request).toHaveBeenCalledWith('config.patch', {
      raw: '{"agents":{}}',
      baseHash: 'h1',
      replacePaths: ['agents.defaults.model.fallbacks'],
    })

    const stale = makeClient({
      responses: {
        'config.patch': gatewayError('config changed since last load; re-run config.get and retry'),
      },
    })
    await expect(stale.client.configPatch({}, 'old')).rejects.toBeInstanceOf(
      OpenClawConfigConflictError,
    )
  })
})

describe('OpenClawClient — awaitSessionComplete', () => {
  it('polls agent.wait until the run leaves the timeout state', async () => {
    const statuses = ['timeout', 'timeout', 'ok']
    const { client, gateways } = makeClient({
      responses: { 'agent.wait': () => ({ runId: 'r', status: statuses.shift() }) },
    })
    await client.awaitSessionComplete({ runId: 'r' }, { timeoutMs: 5_000 })
    expect(gateways[0].request.mock.calls.filter(([m]) => m === 'agent.wait')).toHaveLength(3)
  })

  it('rejects when the run ends in error', async () => {
    const { client } = makeClient({
      responses: { 'agent.wait': { runId: 'r', status: 'error', error: 'model failed' } },
    })
    await expect(client.awaitSessionComplete({ runId: 'r' }, { timeoutMs: 5_000 })).rejects.toThrow(
      'OpenClaw run error: model failed',
    )
  })

  it('resolves a session turn on the terminal chat event', async () => {
    const { client, gateways } = makeClient({})
    await client.connect()
    const done = client.awaitSessionComplete({ sessionKey: 'k' }, { timeoutMs: 5_000 })
    gateways[0].emit('chat', { sessionKey: 'other', state: 'final' })
    gateways[0].emit('chat', { sessionKey: 'k', state: 'final' })
    await expect(done).resolves.toBeUndefined()
  })

  it('rejects a session turn that is aborted', async () => {
    const { client, gateways } = makeClient({})
    await client.connect()
    const done = client.awaitSessionComplete({ sessionKey: 'k' }, { timeoutMs: 5_000 })
    gateways[0].emit('chat', { sessionKey: 'k', state: 'aborted' })
    await expect(done).rejects.toThrow('OpenClaw turn aborted')
  })
})
