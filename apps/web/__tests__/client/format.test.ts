import { describe, expect, it } from 'vitest'
import { actorName, formatUsd, systemActorKey } from '../../lib/format'

describe('formatUsd', () => {
  it('uses two decimals in the reader locale', () => {
    expect(formatUsd('es', 0.61)).toBe('$0,61')
    expect(formatUsd('en', 6.789)).toBe('$6.79')
    expect(formatUsd('es', 0)).toBe('$0,00')
  })

  it('shows spend under a cent as "< $0,01", not as zero', () => {
    expect(formatUsd('es', 0.004)).toBe('< $0,01')
    expect(formatUsd('en', 0.009)).toBe('< $0.01')
  })
})

describe('actorName', () => {
  const agents = [{ id: 'demo-claude', name: 'Claude' }]
  const tActors = (key: string) => `actors.${key}`

  it('keeps the name of agents and people', () => {
    expect(actorName('demo-claude', agents, tActors)).toBe('Claude')
  })

  it('names the system actors readably', () => {
    expect(actorName('web-ui', agents, tActors)).toBe('actors.webUi')
    expect(actorName('system', agents, tActors)).toBe('actors.system')
    expect(actorName('mcp', agents, tActors)).toBe('actors.mcp')
    expect(actorName('cli', agents, tActors)).toBe('actors.cli')
  })

  it('falls back to the id for unknown actors, and to empty for none', () => {
    expect(actorName('someone-else', agents, tActors)).toBe('someone-else')
    expect(actorName(undefined, agents, tActors)).toBe('')
  })

  it('does not treat object prototype keys as system actors', () => {
    expect(systemActorKey('toString')).toBeNull()
  })
})
