import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RuntimeCapability } from '@taia/runtime'
import { createHash } from 'node:crypto'
import {
  OpenClawAdapter,
  OpenClawConfigConflictError,
  OpenClawFileConflictError,
  OpenClawGatewayError,
  OpenClawPairingRequiredError,
} from '@taia/runtime/adapters/openclaw'
import type { OpenClawClient } from '@taia/runtime/adapters/openclaw/client'
import { sampleBundle } from './fixtures/context-bundle'

function makeFakeClient(): OpenClawClient {
  return {
    listAgents: vi.fn().mockResolvedValue([{ id: 'a1', workspace: '/w/a1' }]),
    listSessions: vi.fn().mockResolvedValue([
      {
        key: 'agent:a1:main',
        kind: 'agent',
        sessionId: 's1',
        updatedAt: 1700000000000,
        totalTokens: 1000,
      },
    ]),
    getSessionHistory: vi.fn().mockResolvedValue([
      { role: 'user', content: 'hi', timestamp: 1700000000000, __openclaw: { id: 'm1' } },
      { role: 'toolResult', content: 'out' },
    ]),
    spawnSession: vi.fn().mockResolvedValue({
      key: 'agent:a1:dashboard:1',
      runId: 'run-1',
      runStarted: true,
    }),
    sendToSession: vi.fn().mockResolvedValue({ runId: 'run-2', status: 'started' }),
    listCrons: vi.fn().mockResolvedValue([]),
    cronAction: vi.fn().mockResolvedValue({}),
    getGatewayConfig: vi.fn().mockResolvedValue({
      config: { agents: { entries: {} } },
      hash: 'h1',
    }),
    configPatch: vi.fn().mockResolvedValue({ config: {}, hash: 'h2' }),
    createAgent: vi.fn(),
    updateAgent: vi.fn().mockResolvedValue(undefined),
    deleteAgent: vi.fn().mockResolvedValue(true),
    getHealth: vi.fn().mockResolvedValue({ ok: true, agents: 1 }),
    getConnectionInfo: vi.fn().mockReturnValue({ protocol: 4, scopes: ['operator.read'] }),
    sendChannelMessage: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
    onStateChange: vi.fn().mockReturnValue(() => {}),
    getState: vi.fn().mockReturnValue('connected'),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as OpenClawClient
}

describe('OpenClawAdapter', () => {
  let client: OpenClawClient
  let adapter: OpenClawAdapter

  beforeEach(() => {
    client = makeFakeClient()
    adapter = new OpenClawAdapter(client)
  })

  it('declares the expected runtime capabilities', () => {
    expect(adapter.id).toBe('openclaw')
    expect(adapter.capabilities.has(RuntimeCapability.Sessions)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Transcripts)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Cron)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Approvals)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.LiveEvents)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.AgentProvisioning)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Health)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Messaging)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.ContextSync)).toBe(true)
  })

  it('maps sessions.create results to a canonical SpawnResult', async () => {
    const result = await adapter.spawnSession!('do something')
    expect(result).toEqual({
      status: 'accepted',
      runId: 'run-1',
      sessionKey: 'agent:a1:dashboard:1',
    })
  })

  it('maps chat.send results to a SendResult', async () => {
    await expect(adapter.sendToSession!('k', 'hola')).resolves.toEqual({
      status: 'accepted',
      runId: 'run-2',
    })
  })

  it('maps RuntimeAgent shape from the client list, naming agents by id', async () => {
    const agents = await adapter.listAgents()
    expect(agents).toEqual([{ id: 'a1', name: 'a1', configured: true }])
  })

  it('maps RuntimeSession with token counts preserved', async () => {
    const sessions = await adapter.listSessions!()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].key).toBe('agent:a1:main')
    expect(sessions[0].agentId).toBe('a1')
    expect(sessions[0].totalTokens).toBe(1000)
  })

  it('maps chat.history messages, converting timestamps and tool roles', async () => {
    const messages = await adapter.getSessionHistory!('agent:a1:main')
    expect(messages[0]).toEqual({
      id: 'm1',
      role: 'user',
      content: 'hi',
      timestamp: '2023-11-14T22:13:20.000Z',
      model: undefined,
      stopReason: undefined,
    })
    expect(messages[1].role).toBe('tool')
  })

  it('getHealth reports ok:false instead of throwing', async () => {
    vi.mocked(client.getHealth).mockRejectedValueOnce(new Error('down'))
    await expect(adapter.getHealth()).resolves.toEqual({ ok: false })
  })

  it('isAvailable returns true when the underlying client is connected', async () => {
    expect(await adapter.isAvailable()).toBe(true)
  })

  describe('testConnection', () => {
    it('connects and reports agents plus protocol facts', async () => {
      await expect(adapter.testConnection()).resolves.toEqual({
        ok: true,
        agents: 1,
        details: { protocol: 4, scopes: ['operator.read'] },
      })
    })

    it('reports pairing with the request id an operator must approve', async () => {
      vi.mocked(client.connect).mockRejectedValueOnce(
        new OpenClawPairingRequiredError('device pairing required', 'req-1', 'dev-1'),
      )
      await expect(adapter.testConnection()).resolves.toMatchObject({
        ok: false,
        reason: 'pairing_required',
        details: { requestId: 'req-1', deviceId: 'dev-1' },
      })
    })

    it.each([
      [new OpenClawGatewayError('token mismatch', 'AUTH_TOKEN_MISMATCH'), 'unauthorized'],
      [new Error('connect ECONNREFUSED 127.0.0.1:18789'), 'unreachable'],
      [new Error('boom'), 'unknown'],
    ])('classifies %s as %s', async (error, reason) => {
      vi.mocked(client.connect).mockRejectedValueOnce(error)
      await expect(adapter.testConnection()).resolves.toMatchObject({ ok: false, reason })
    })
  })

  it('forwards channel messages to the gateway client', async () => {
    await adapter.sendChannelMessage({ channel: 'telegram', target: 'u1', text: 'hola' })
    expect(client.sendChannelMessage).toHaveBeenCalledWith('telegram', 'u1', 'hola')
  })

  describe('pull context sync', () => {
    const withBase = () =>
      new OpenClawAdapter(client, { taiaBaseUrl: 'http://taia.test', contextSync: 'pull' })

    it('sends the task untouched when no bundle is given', async () => {
      await withBase().spawnSession('plain task', { agentId: 'alex' })
      expect(client.spawnSession).toHaveBeenCalledWith('plain task', { agentId: 'alex' })
    })

    it('kicks off a heartbeat with a pointer to the agent context', async () => {
      await withBase().spawnSession('fallback', {
        agentId: 'alex',
        context: sampleBundle(),
        trigger: { kind: 'heartbeat' },
      })
      const message = vi.mocked(client.spawnSession).mock.calls[0][0]
      expect(message).toMatch(
        /^Your identity, instructions and the TAIA API are at GET http:\/\/taia\.test\/api\/agents\/alex\/files/,
      )
      expect(message).toContain('# Heartbeat')
      expect(message).toContain('# Task: Review PR #42')
      expect(message).not.toContain('fallback')
    })

    it('passes a prompt through, after the pointer', async () => {
      await withBase().spawnSession('Summarise the board.', {
        agentId: 'alex',
        context: sampleBundle(),
        trigger: { kind: 'prompt' },
      })
      expect(vi.mocked(client.spawnSession).mock.calls[0][0]).toMatch(
        /files — read them before you start\.\n\nSummarise the board\.$/,
      )
    })

    it('projects the bundle and reports pull-only sync', async () => {
      const a = withBase()
      const projection = a.projectAgentContext(sampleBundle())
      const outcome = await a.syncAgentContext({ agentId: 'alex', bundle: sampleBundle() })
      expect(outcome).toEqual({
        status: 'pull_only',
        state: { mode: 'pull', fingerprint: projection.fingerprint, remoteHashes: {} },
      })
    })

    it('gives new heartbeat crons a message that points to the agent context', async () => {
      await withBase().cronAction('add', {
        agentId: 'alex',
        schedule: { kind: 'cron', expr: '* * * * *' },
      })
      const params = vi.mocked(client.cronAction).mock.calls[0][1] as { message: string }
      expect(params.message).toContain('GET http://taia.test/api/agents/alex/files')
      expect(params.message).toContain('HEARTBEAT_OK')
    })

    it('keeps a cron message the caller set', async () => {
      await withBase().cronAction('add', { agentId: 'alex', message: 'custom' })
      expect(client.cronAction).toHaveBeenCalledWith('add', { agentId: 'alex', message: 'custom' })
    })
  })

  describe('push context sync', () => {
    // A fake workspace: name -> content, hashed like the gateway does.
    let workspace: Map<string, string>
    const sha = (c: string) => createHash('sha256').update(c, 'utf8').digest('hex')
    const push = () =>
      new OpenClawAdapter(client, { taiaBaseUrl: 'http://taia.test', contextSync: 'push' })

    beforeEach(() => {
      workspace = new Map([['SOUL.md', '# OpenClaw seed soul\n']])
      Object.assign(client, {
        getAgentFile: vi.fn(async (_agentId: string, name: string) => {
          const content = workspace.get(name)
          return content === undefined
            ? { name, path: `/w/${name}`, missing: true }
            : { name, path: `/w/${name}`, missing: false, hash: sha(content), content }
        }),
        setAgentFile: vi.fn(
          async (
            _agentId: string,
            name: string,
            content: string,
            pre?: Record<string, unknown>,
          ) => {
            const current = workspace.get(name)
            const stale =
              (pre && 'expectedHash' in pre && (!current || sha(current) !== pre.expectedHash)) ||
              (pre && 'expectedMissing' in pre && current !== undefined)
            if (stale) throw new OpenClawFileConflictError(name, current ? sha(current) : undefined)
            workspace.set(name, content)
            return { name, path: `/w/${name}`, missing: false, hash: sha(content) }
          },
        ),
      })
    })

    it('writes every file on the first sync, guarded by what it read', async () => {
      const outcome = await push().syncAgentContext({ agentId: 'alex', bundle: sampleBundle() })

      expect(outcome.status).toBe('pushed')
      expect(outcome.status === 'pushed' && outcome.changedPaths).toEqual([
        'SOUL.md',
        'IDENTITY.md',
        'AGENTS.md',
        'USER.md',
      ])
      expect(client.setAgentFile).toHaveBeenCalledWith('alex', 'SOUL.md', expect.any(String), {
        expectedHash: sha('# OpenClaw seed soul\n'),
      })
      expect(client.setAgentFile).toHaveBeenCalledWith('alex', 'USER.md', expect.any(String), {
        expectedMissing: true,
      })
      expect(outcome.state.mode).toBe('push')
      expect(outcome.state.remoteHashes['SOUL.md']).toBe(sha(workspace.get('SOUL.md')!))
    })

    it('does nothing when the fingerprint is unchanged', async () => {
      const adapter = push()
      const first = await adapter.syncAgentContext({ agentId: 'alex', bundle: sampleBundle() })
      vi.mocked(client.getAgentFile).mockClear()

      const again = await adapter.syncAgentContext({
        agentId: 'alex',
        bundle: sampleBundle(),
        previous: first.state,
      })
      expect(again.status).toBe('unchanged')
      expect(client.getAgentFile).not.toHaveBeenCalled()
    })

    it('leaves a file the agent edited and reports the conflict', async () => {
      const adapter = push()
      const first = await adapter.syncAgentContext({ agentId: 'alex', bundle: sampleBundle() })
      workspace.set('SOUL.md', '# edited by the agent\n')
      const bundle = sampleBundle()
      const changed = { ...bundle, agent: { ...bundle.agent, persona: 'New persona.' } }

      const outcome = await adapter.syncAgentContext({
        agentId: 'alex',
        bundle: changed,
        previous: first.state,
      })

      expect(outcome.status).toBe('conflict')
      expect(outcome.status === 'conflict' && outcome.conflicts).toEqual([
        { path: 'SOUL.md', remoteHash: sha('# edited by the agent\n') },
      ])
      expect(workspace.get('SOUL.md')).toBe('# edited by the agent\n')
      // The old fingerprint is kept so the next sync retries.
      expect(outcome.state.fingerprint).toBe(first.state.fingerprint)
    })

    it('overwrites an edited file with force', async () => {
      const adapter = push()
      const first = await adapter.syncAgentContext({ agentId: 'alex', bundle: sampleBundle() })
      workspace.set('SOUL.md', '# edited by the agent\n')

      const outcome = await adapter.syncAgentContext({
        agentId: 'alex',
        bundle: sampleBundle(),
        previous: first.state,
        force: true,
      })

      expect(outcome.status).toBe('pushed')
      expect(workspace.get('SOUL.md')).toContain('You review pull requests carefully.')
    })

    it('reports a conflict when the file changes between read and write', async () => {
      vi.mocked(client.setAgentFile).mockRejectedValueOnce(
        new OpenClawFileConflictError('SOUL.md', 'f'.repeat(64)),
      )
      const outcome = await push().syncAgentContext({ agentId: 'alex', bundle: sampleBundle() })
      expect(outcome.status === 'conflict' && outcome.conflicts).toEqual([
        { path: 'SOUL.md', remoteHash: 'f'.repeat(64) },
      ])
    })

    it('pushes by default', async () => {
      const outcome = await new OpenClawAdapter(client).syncAgentContext({
        agentId: 'alex',
        bundle: sampleBundle(),
      })
      expect(outcome.status).not.toBe('pull_only')
    })

    it('stops pointing the agent at /files once context is pushed', async () => {
      await push().spawnSession('x', {
        agentId: 'alex',
        context: sampleBundle(),
        trigger: { kind: 'heartbeat' },
      })
      expect(vi.mocked(client.spawnSession).mock.calls[0][0]).toMatch(/^# Heartbeat/)

      await push().cronAction('add', { agentId: 'alex' })
      expect(client.cronAction).toHaveBeenCalledWith('add', { agentId: 'alex' })
    })
  })

  describe('settings and native config', () => {
    beforeEach(() => {
      vi.mocked(client.getGatewayConfig).mockResolvedValue({
        config: {
          agents: {
            defaults: { model: 'anthropic/claude-opus-5-5' },
            entries: { a1: { model: { primary: 'openai/gpt-5.4' }, tools: { deny: ['exec'] } } },
          },
        },
        hash: 'h1',
      })
    })

    it('reports neutral runtime settings', async () => {
      expect(await adapter.getRuntimeSettings()).toEqual({
        defaults: { model: { primary: 'anthropic/claude-opus-5-5', fallbacks: [] } },
        agents: {
          a1: { model: { primary: 'openai/gpt-5.4', fallbacks: [] }, deniedTools: ['exec'] },
        },
        revision: 'h1',
      })
    })

    it('exposes the gateway config untouched as the native document', async () => {
      const native = await adapter.getNativeConfig()
      expect(native.revision).toBe('h1')
      expect(native.document).toHaveProperty('agents.entries.a1')

      await adapter.patchNativeConfig({ agents: { entries: { a1: {} } } }, 'h1')
      expect(client.configPatch).toHaveBeenCalledWith({ agents: { entries: { a1: {} } } }, 'h1')
    })
  })

  describe('agent provisioning', () => {
    const withAgents = (entries: Record<string, unknown>, hash = 'h1') => ({
      config: { agents: { entries } },
      hash,
    })

    it('leaves an agent that already exists untouched', async () => {
      vi.mocked(client.getGatewayConfig).mockResolvedValue(
        withAgents({ dev: { model: 'a/b', workspace: '/w-dev' } }),
      )

      const outcome = await adapter.provisionAgent({ id: 'dev', name: 'Dev', settings: {} })

      expect(outcome).toEqual({
        status: 'exists',
        effective: { model: { primary: 'a/b', fallbacks: [] }, workspace: '/w-dev' },
      })
      expect(client.createAgent).not.toHaveBeenCalled()
    })

    it('creates the agent under its id, renames it and patches the rest', async () => {
      vi.mocked(client.getGatewayConfig)
        .mockResolvedValueOnce(withAgents({}))
        .mockResolvedValue(withAgents({ dev: { name: 'Dev', model: 'a/b' } }, 'h2'))
      vi.mocked(client.createAgent).mockResolvedValue({
        agentId: 'dev',
        name: 'dev',
        workspace: '/w-dev',
      })
      vi.mocked(client.configPatch).mockResolvedValue(
        withAgents(
          { dev: { model: { primary: 'a/b', fallbacks: ['c/d'] }, tools: { deny: ['exec'] } } },
          'h3',
        ),
      )

      const outcome = await adapter.provisionAgent({
        id: 'dev',
        name: 'Dev',
        settings: { model: { primary: 'a/b', fallbacks: ['c/d'] }, deniedTools: ['exec'] },
      })

      expect(client.createAgent).toHaveBeenCalledWith({ name: 'dev', model: 'a/b' })
      expect(client.updateAgent).toHaveBeenCalledWith({ agentId: 'dev', name: 'Dev' })
      expect(client.configPatch).toHaveBeenCalledWith(
        {
          agents: {
            entries: {
              dev: { model: { primary: 'a/b', fallbacks: ['c/d'] }, tools: { deny: ['exec'] } },
            },
          },
        },
        'h2',
        ['agents.entries.dev.model.fallbacks', 'agents.entries.dev.tools.deny'],
      )
      expect(outcome).toEqual({
        status: 'created',
        effective: { model: { primary: 'a/b', fallbacks: ['c/d'] }, deniedTools: ['exec'] },
      })
    })

    it('skips the patch when agents.create covers every setting', async () => {
      vi.mocked(client.createAgent).mockResolvedValue({
        agentId: 'dev',
        name: 'dev',
        workspace: '/w',
      })

      const outcome = await adapter.provisionAgent({ id: 'dev', name: 'dev', settings: {} })

      expect(outcome.status).toBe('created')
      expect(client.updateAgent).not.toHaveBeenCalled()
      expect(client.configPatch).not.toHaveBeenCalled()
    })

    it('rolls back and fails when the gateway derives a different id', async () => {
      vi.mocked(client.createAgent).mockResolvedValue({
        agentId: 'my-agent',
        name: 'My_Agent',
        workspace: '/w',
      })

      const outcome = await adapter.provisionAgent({ id: 'My_Agent', name: 'X', settings: {} })

      expect(outcome.status).toBe('failed')
      expect(outcome.manualHint).toContain('openclaw agents add My_Agent')
      expect(client.deleteAgent).toHaveBeenCalledWith('my-agent', true)
    })

    it('reports a failure with a manual hint instead of throwing', async () => {
      vi.mocked(client.createAgent).mockRejectedValue(new OpenClawGatewayError('denied'))

      const outcome = await adapter.provisionAgent({
        id: 'dev',
        name: 'Dev',
        settings: { model: { primary: 'a/b', fallbacks: [] } },
      })

      expect(outcome).toEqual({
        status: 'failed',
        error: 'denied',
        manualHint: 'On the OpenClaw host run: openclaw agents add dev --model a/b',
      })
    })

    it('updates settings with the config hash and retries once on a conflict', async () => {
      vi.mocked(client.getGatewayConfig)
        .mockResolvedValueOnce(withAgents({ dev: {} }, 'h1'))
        .mockResolvedValueOnce(withAgents({ dev: {} }, 'h2'))
      vi.mocked(client.configPatch)
        .mockRejectedValueOnce(new OpenClawConfigConflictError('config changed since last load'))
        .mockResolvedValueOnce(withAgents({ dev: { workspace: '/w' } }, 'h3'))

      const outcome = await adapter.updateAgentSettings('dev', { model: null })

      expect(client.configPatch).toHaveBeenLastCalledWith(
        { agents: { entries: { dev: { model: null } } } },
        'h2',
        ['agents.entries.dev.model.fallbacks'],
      )
      expect(outcome).toEqual({ status: 'updated', effective: { workspace: '/w' } })
    })

    it('refuses to update an agent the gateway does not have', async () => {
      const outcome = await adapter.updateAgentSettings('ghost', { deniedTools: ['exec'] })

      expect(outcome.status).toBe('failed')
      expect(outcome.error).toContain('ghost')
      expect(client.configPatch).not.toHaveBeenCalled()
    })

    it('deprovisions without deleting the workspace', async () => {
      await adapter.deprovisionAgent('dev')
      expect(client.deleteAgent).toHaveBeenCalledWith('dev', false)
    })

    it('sets runtime defaults against the expected revision', async () => {
      await adapter.setRuntimeDefaults(
        { model: { primary: 'a/b', fallbacks: ['c/d'] } },
        { expectedRevision: 'h9' },
      )
      expect(client.configPatch).toHaveBeenCalledWith(
        { agents: { defaults: { model: { primary: 'a/b', fallbacks: ['c/d'] } } } },
        'h9',
        ['agents.defaults.model.fallbacks'],
      )
    })
  })
})
