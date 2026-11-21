// Claude model registry — lookup and capability gating.

import { describe, it, expect } from 'vitest'
import {
  CURRENT_CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  findClaudeModel,
  supportsAdaptiveThinking,
  suggestFallbackChain,
} from '@taia/runtime/models'

describe('findClaudeModel', () => {
  it('resolves exact, prefixed and dated ids', () => {
    expect(findClaudeModel('claude-opus-5-5')?.id).toBe('claude-opus-5-5')
    expect(findClaudeModel('anthropic/claude-sonnet-5-5')?.id).toBe('claude-sonnet-5-5')
    expect(findClaudeModel('claude-opus-4-20250514')?.id).toBe('claude-opus-4')
  })

  it('prefers the more specific id', () => {
    expect(findClaudeModel('claude-opus-5-5')?.id).toBe('claude-opus-5-5')
    expect(findClaudeModel('claude-fable-5-1')?.id).toBe('claude-fable-5-1')
  })

  it('returns undefined for empty or non-Claude ids', () => {
    expect(findClaudeModel('')).toBeUndefined()
    expect(findClaudeModel('gpt-4-turbo')).toBeUndefined()
  })
})

describe('supportsAdaptiveThinking', () => {
  it('is true for current and 4.6+ models', () => {
    for (const id of [
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
    ]) {
      expect(supportsAdaptiveThinking(id)).toBe(true)
    }
  })

  it('is false for pre-4.6 models', () => {
    for (const id of [
      'claude-haiku-4-5',
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-3-5-sonnet',
    ]) {
      expect(supportsAdaptiveThinking(id)).toBe(false)
    }
  })

  it('treats unknown ids as adaptive only when they look like 5.x+', () => {
    expect(supportsAdaptiveThinking('claude-opus-6')).toBe(true)
    expect(supportsAdaptiveThinking('claude-3-opus-20240229')).toBe(false)
    expect(supportsAdaptiveThinking('gpt-5')).toBe(false)
  })
})

describe('defaults', () => {
  it('default model is one of the current models', () => {
    expect(CURRENT_CLAUDE_MODELS.map((m) => m.id)).toContain(DEFAULT_CLAUDE_MODEL)
  })
})

describe('suggestFallbackChain', () => {
  it('suggests the family chain for a primary without fallbacks', () => {
    expect(suggestFallbackChain({ primary: 'anthropic/claude-opus-5-5' })).toEqual({
      primary: 'anthropic/claude-opus-5-5',
      fallbacks: ['anthropic/claude-sonnet-5-5', 'anthropic/claude-haiku-5-5'],
    })
    expect(suggestFallbackChain({ primary: 'anthropic/claude-sonnet-4-6' })?.fallbacks).toEqual([
      'anthropic/claude-haiku-5-5',
    ])
    expect(suggestFallbackChain({ primary: 'openai/gpt-5.4' })?.fallbacks).toEqual([
      'openai/gpt-5.4-mini',
    ])
  })

  it('never replaces fallbacks the user set', () => {
    expect(
      suggestFallbackChain({ primary: 'anthropic/claude-opus-5-5', fallbacks: ['x/y'] }),
    ).toBeNull()
  })

  it('returns null without a primary or for an unknown family', () => {
    expect(suggestFallbackChain(undefined)).toBeNull()
    expect(suggestFallbackChain({})).toBeNull()
    expect(suggestFallbackChain({ primary: 'ollama/llama3.3' })).toBeNull()
    expect(suggestFallbackChain({ primary: 'mistral/mistral-large', fallbacks: [] })).toBeNull()
  })
})
