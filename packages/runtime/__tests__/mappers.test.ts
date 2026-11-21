import { describe, it, expect } from 'vitest'
import {
  toRuntimeAgent,
  toRuntimeCronJob,
  toRuntimeMessage,
  toRuntimeSession,
  toRuntimeSpawnResult,
  toAgentSettingsPatch,
  toDefaultsPatch,
  toRuntimeSettingsSnapshot,
} from '../src/adapters/openclaw/mappers'

describe('OpenClaw mappers', () => {
  it('toRuntimeAgent preserves identity fields', () => {
    expect(toRuntimeAgent({ id: 'a', name: 'A', configured: true })).toEqual({
      id: 'a',
      name: 'A',
      configured: true,
    })
  })

  it('toRuntimeSession preserves token counts and label', () => {
    const result = toRuntimeSession({
      key: 'agent:x:main',
      kind: 'agent',
      sessionId: 's1',
      updatedAt: 100,
      label: 'L',
      model: 'm',
      totalTokens: 9,
      inputTokens: 5,
      outputTokens: 4,
    })
    expect(result.label).toBe('L')
    expect(result.totalTokens).toBe(9)
    expect(result.inputTokens).toBe(5)
    expect(result.outputTokens).toBe(4)
  })

  it('toRuntimeMessage preserves stopReason and content', () => {
    const result = toRuntimeMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      stopReason: 'end_turn',
    })
    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }])
  })

  it('toRuntimeCronJob preserves schedule and state', () => {
    const result = toRuntimeCronJob({
      id: 'c1',
      agentId: 'a1',
      enabled: true,
      schedule: { kind: 'cron', expr: '0 * * * *', tz: 'UTC' },
      state: { lastStatus: 'ok' },
    })
    expect(result.schedule.expr).toBe('0 * * * *')
    expect(result.state?.lastStatus).toBe('ok')
  })

  it('toRuntimeSpawnResult maps the sessions.create key to sessionKey', () => {
    const result = toRuntimeSpawnResult({ key: 'agent:a:dashboard:1', runId: 'run-x' })
    expect(result).toEqual({
      status: 'accepted',
      runId: 'run-x',
      sessionKey: 'agent:a:dashboard:1',
    })
  })

  it('toAgentSettingsPatch writes the entry and lists the arrays it replaces', () => {
    expect(
      toAgentSettingsPatch('dev', {
        model: { primary: 'anthropic/claude-opus-5-5', fallbacks: ['anthropic/claude-sonnet-5-5'] },
        deniedTools: ['exec'],
        workspace: '/w-dev',
      }),
    ).toEqual({
      patch: {
        agents: {
          entries: {
            dev: {
              model: {
                primary: 'anthropic/claude-opus-5-5',
                fallbacks: ['anthropic/claude-sonnet-5-5'],
              },
              tools: { deny: ['exec'] },
              workspace: '/w-dev',
            },
          },
        },
      },
      replacePaths: ['agents.entries.dev.model.fallbacks', 'agents.entries.dev.tools.deny'],
    })
  })

  it('toAgentSettingsPatch resets null fields and leaves omitted ones alone', () => {
    expect(toAgentSettingsPatch('dev', { model: null, deniedTools: [], workspace: null })).toEqual({
      patch: { agents: { entries: { dev: { model: null, tools: null } } } },
      replacePaths: ['agents.entries.dev.model.fallbacks', 'agents.entries.dev.tools.deny'],
    })
    expect(toAgentSettingsPatch('dev', {})).toEqual({ patch: {}, replacePaths: [] })
    // Other tool settings stay; only the deny list goes.
    expect(
      toAgentSettingsPatch(
        'dev',
        { deniedTools: null },
        { tools: { deny: ['x'], allow: ['y'] } as never },
      ).patch,
    ).toEqual({ agents: { entries: { dev: { tools: { deny: null } } } } })
  })

  it('toDefaultsPatch writes the default model and workspace', () => {
    expect(
      toDefaultsPatch({ model: { primary: 'a/b', fallbacks: ['c/d'] }, workspaceRoot: '/w' }),
    ).toEqual({
      patch: {
        agents: { defaults: { model: { primary: 'a/b', fallbacks: ['c/d'] }, workspace: '/w' } },
      },
      replacePaths: ['agents.defaults.model.fallbacks'],
    })
    expect(toDefaultsPatch({})).toEqual({ patch: {}, replacePaths: [] })
  })

  it('marks cron jobs declared by the gateway as runtime-managed', () => {
    const base = { id: 'j', enabled: true, schedule: { kind: 'every' } }
    expect(toRuntimeCronJob({ ...base, declarationKey: 'heartbeat:main' }).managedByRuntime).toBe(
      true,
    )
    expect(toRuntimeCronJob(base).managedByRuntime).toBe(false)
  })
})

describe('toRuntimeSettingsSnapshot', () => {
  it('maps gateway agents.entries to neutral settings', () => {
    const snapshot = toRuntimeSettingsSnapshot({
      hash: 'rev-1',
      config: {
        agents: {
          defaults: {
            model: {
              primary: 'anthropic/claude-opus-5-5',
              fallbacks: ['anthropic/claude-haiku-5-5'],
            },
            workspace: '/home/node/.openclaw/workspace',
          },
          entries: {
            main: {},
            alex: {
              name: 'Alex',
              model: 'openai/gpt-5.4',
              tools: { deny: ['exec'] },
              workspace: '/w/alex',
            },
          },
        },
      },
    })

    expect(snapshot).toEqual({
      defaults: {
        model: { primary: 'anthropic/claude-opus-5-5', fallbacks: ['anthropic/claude-haiku-5-5'] },
        workspaceRoot: '/home/node/.openclaw/workspace',
      },
      agents: {
        main: {},
        alex: {
          name: 'Alex',
          model: { primary: 'openai/gpt-5.4', fallbacks: [] },
          deniedTools: ['exec'],
          workspace: '/w/alex',
        },
      },
      revision: 'rev-1',
    })
  })

  it('reads the legacy agents.list schema and a string default model', () => {
    const snapshot = toRuntimeSettingsSnapshot({
      config: {
        agents: {
          defaults: { model: 'anthropic/claude-sonnet-5-5' },
          list: [
            { id: 'bob', model: { primary: 'anthropic/claude-haiku-5-5' } },
            { name: 'no id' },
          ],
        },
      },
    })
    expect(snapshot.defaults.model).toEqual({
      primary: 'anthropic/claude-sonnet-5-5',
      fallbacks: [],
    })
    expect(Object.keys(snapshot.agents)).toEqual(['bob'])
    expect(snapshot.revision).toBeUndefined()
  })
})
