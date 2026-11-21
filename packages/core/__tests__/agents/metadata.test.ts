import { describe, it, expect } from 'vitest'
import {
  getDefaultName,
  getDefaultRole,
  getDefaultAvatar,
  getAgentDisplay,
  getFallbackAgents,
} from '@taia/core/agents/metadata'

describe('getDefaultName', () => {
  it('returns id as name for any agent', () => {
    expect(getDefaultName('agent-1')).toBe('agent-1')
    expect(getDefaultName('my-custom-agent')).toBe('my-custom-agent')
  })
})

describe('getDefaultRole', () => {
  it('returns generic "Agent" role for any agent', () => {
    expect(getDefaultRole('agent-1')).toBe('Agent')
    expect(getDefaultRole('unknown')).toBe('Agent')
  })
})

describe('getDefaultAvatar', () => {
  it('returns default robot emoji for any agent', () => {
    expect(getDefaultAvatar('agent-1')).toBe('🤖')
    expect(getDefaultAvatar('unknown')).toBe('🤖')
  })
})

describe('getAgentDisplay', () => {
  it('returns id for any agent', () => {
    expect(getAgentDisplay('agent-1')).toBe('agent-1')
    expect(getAgentDisplay('unknown')).toBe('unknown')
  })
})

describe('getFallbackAgents', () => {
  it('returns empty array', () => {
    const agents = getFallbackAgents()
    expect(agents).toHaveLength(0)
    expect(agents).toEqual([])
  })
})
