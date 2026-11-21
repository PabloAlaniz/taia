import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@taia/core/runtime', () => ({ forEachRuntime: vi.fn() }))

import { effectiveModel, getRuntimeSettings } from '@taia/core/services/runtime-settings.service'

const snapshot = {
  defaults: { model: { primary: 'anthropic/claude-opus-5-5', fallbacks: [] } },
  agents: { alex: { model: { primary: 'openai/gpt-5.4', fallbacks: [] } }, bob: {} },
}

beforeEach(() => vi.clearAllMocks())

describe('getRuntimeSettings', () => {
  it('reads the snapshot from runtimes that publish settings', async () => {
    const adapter = {
      id: 'openclaw',
      capabilities: { has: () => true },
      getRuntimeSettings: vi.fn().mockResolvedValue(snapshot),
    }
    expect(await getRuntimeSettings(adapter as never)).toEqual({
      provider: 'openclaw',
      supported: true,
      settings: snapshot,
    })
  })

  it('reports unsupported runtimes', async () => {
    const adapter = { id: 'anthropic', capabilities: { has: () => false } }
    expect(await getRuntimeSettings(adapter as never)).toEqual({
      provider: 'anthropic',
      supported: false,
    })
  })
})

describe('effectiveModel', () => {
  it('uses the agent model, else the runtime default', () => {
    expect(effectiveModel(snapshot, 'alex')?.primary).toBe('openai/gpt-5.4')
    expect(effectiveModel(snapshot, 'bob')?.primary).toBe('anthropic/claude-opus-5-5')
    expect(effectiveModel(snapshot, 'unknown')?.primary).toBe('anthropic/claude-opus-5-5')
  })
})
