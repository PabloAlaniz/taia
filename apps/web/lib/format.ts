/** "$0,42" in es/pt, "$0.42" in en: the dollar sign stays in front. */
export function formatUsd(locale: string, value: number): string {
  return `$${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
