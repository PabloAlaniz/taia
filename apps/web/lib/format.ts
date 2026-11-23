/**
 * "$0,42" in es/pt, "$0.42" in en: the dollar sign stays in front. The one
 * money format of the app: two decimals, and "< $0,01" for a spend too small
 * to show in cents (it is not zero).
 */
export function formatUsd(locale: string, value: number): string {
  const usd = (n: number) =>
    `$${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (value > 0 && value < 0.01) return `< ${usd(0.01)}`
  return usd(value)
}

/**
 * Ids TAIA writes as the author of an action when no agent or person did it
 * (SYSTEM_ACTORS in packages/core), with the `actors` message key naming each.
 */
const SYSTEM_ACTORS = {
  'web-ui': 'webUi',
  system: 'system',
  mcp: 'mcp',
  cli: 'cli',
  'planning-wizard': 'planningWizard',
} as const

export type SystemActorKey = (typeof SYSTEM_ACTORS)[keyof typeof SYSTEM_ACTORS]

/** The `actors` message key for a system actor id, or null for agents and people. */
export function systemActorKey(id: string | null | undefined): SystemActorKey | null {
  if (!id || !Object.prototype.hasOwnProperty.call(SYSTEM_ACTORS, id)) return null
  return SYSTEM_ACTORS[id as keyof typeof SYSTEM_ACTORS]
}

/**
 * Who did something, the way a person reads it: the participant's name, a
 * readable name for TAIA's own actors (web-ui, system, mcp, cli), and the raw
 * id only when it matches nothing. `tActors` is useTranslations('actors').
 */
export function actorName(
  id: string | null | undefined,
  agents: readonly { id: string; name: string }[],
  tActors: (key: SystemActorKey) => string,
): string {
  if (!id) return ''
  const agent = agents.find((a) => a.id === id)
  if (agent) return agent.name
  const key = systemActorKey(id)
  return key ? tActors(key) : id
}

/** Participant kind: people are agents of type `human`. */
export function participantKind(agent?: { type?: string } | null): 'agent' | 'person' | null {
  if (!agent) return null
  return agent.type === 'human' ? 'person' : 'agent'
}

/** 1.2K / 3.4M tokens. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}
