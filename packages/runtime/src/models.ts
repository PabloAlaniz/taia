// Claude model registry — single source of truth for model ids, pricing and
// request capabilities. Pure data (no runtime deps) so client components can
// import it via `@taia/runtime/models`.

export interface ClaudeModelInfo {
  id: string
  label: string
  /** USD per 1M input tokens */
  inputPer1M: number
  /** USD per 1M output tokens */
  outputPer1M: number
  /** Overrides the default cache-read multiplier (0.1× input) when set */
  cacheReadPer1M?: number
  /** Overrides the default cache-write multiplier (1.25× input) when set */
  cacheWritePer1M?: number
  /** Accepts `thinking: { type: 'adaptive' }` */
  adaptiveThinking: boolean
  /** Offered in model pickers */
  current?: boolean
}

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5'

// Order matters: more specific IDs first so substring fuzzy match catches them
// before falling back to a less specific entry (opus-5-5 before opus-5).
// Haiku 5.5 is priced for prompts up to 100K tokens; the long-prompt tier
// ($0.50 / $2.50) is not modeled.
export const CLAUDE_MODELS: ClaudeModelInfo[] = [
  // Claude 5.x family (current)
  {
    id: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    inputPer1M: 10,
    outputPer1M: 50,
    cacheReadPer1M: 0.25,
    adaptiveThinking: true,
  },
  {
    id: 'claude-fable-5',
    label: 'Claude Fable 5',
    inputPer1M: 10,
    outputPer1M: 50,
    adaptiveThinking: true,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    inputPer1M: 4,
    outputPer1M: 20,
    cacheReadPer1M: 0.2,
    adaptiveThinking: true,
    current: true,
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    inputPer1M: 5,
    outputPer1M: 25,
    adaptiveThinking: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    inputPer1M: 2,
    outputPer1M: 10,
    cacheReadPer1M: 0.2,
    adaptiveThinking: true,
    current: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    inputPer1M: 2,
    outputPer1M: 10,
    adaptiveThinking: true,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    adaptiveThinking: true,
    current: true,
  },
  // Claude 4.x family
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    inputPer1M: 5,
    outputPer1M: 25,
    adaptiveThinking: true,
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    inputPer1M: 5,
    outputPer1M: 25,
    adaptiveThinking: true,
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    inputPer1M: 5,
    outputPer1M: 25,
    adaptiveThinking: true,
  },
  {
    id: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    inputPer1M: 15,
    outputPer1M: 75,
    adaptiveThinking: false,
  },
  {
    id: 'claude-opus-4-1',
    label: 'Claude Opus 4.1',
    inputPer1M: 15,
    outputPer1M: 75,
    adaptiveThinking: false,
  },
  {
    id: 'claude-opus-4',
    label: 'Claude Opus 4',
    inputPer1M: 15,
    outputPer1M: 75,
    adaptiveThinking: false,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    inputPer1M: 3,
    outputPer1M: 15,
    adaptiveThinking: true,
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    inputPer1M: 3,
    outputPer1M: 15,
    adaptiveThinking: false,
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    inputPer1M: 3,
    outputPer1M: 15,
    adaptiveThinking: false,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    inputPer1M: 1,
    outputPer1M: 5,
    adaptiveThinking: false,
  },
  {
    id: 'claude-haiku-4',
    label: 'Claude Haiku 4',
    inputPer1M: 0.8,
    outputPer1M: 4,
    adaptiveThinking: false,
  },
  // Legacy 3.x (kept for historical session_costs rows)
  {
    id: 'claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    inputPer1M: 3,
    outputPer1M: 15,
    adaptiveThinking: false,
  },
  {
    id: 'claude-3-5-haiku',
    label: 'Claude 3.5 Haiku',
    inputPer1M: 0.8,
    outputPer1M: 4,
    adaptiveThinking: false,
  },
]

export const CURRENT_CLAUDE_MODELS: ClaudeModelInfo[] = CLAUDE_MODELS.filter((m) => m.current)

/**
 * Resolve a model id to its registry entry. Accepts provider-prefixed ids
 * (`anthropic/claude-opus-5-5`) and dated/suffixed variants via fuzzy match.
 */
export function findClaudeModel(model: string): ClaudeModelInfo | undefined {
  const normalized = model.toLowerCase().trim()
  if (!normalized) return undefined

  const exact = CLAUDE_MODELS.find((m) => normalized === m.id)
  if (exact) return exact

  const fuzzy = CLAUDE_MODELS.find((m) => normalized.includes(m.id))
  if (fuzzy) return fuzzy

  return CLAUDE_MODELS.find((m) => m.id.includes(normalized))
}

/**
 * Whether a request for `model` may carry `thinking: { type: 'adaptive' }`.
 * Unknown ids are treated as adaptive only when they look like a 5.x+ release,
 * so future models work without a registry update while older unknown ids
 * never receive a parameter they would reject.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  const known = findClaudeModel(model)
  if (known) return known.adaptiveThinking
  return /claude-[a-z]+-([5-9]|\d{2,})/.test(model.toLowerCase())
}

/**
 * Suggest fallbacks for a model selection that has none yet, from the
 * primary model's family. Returns null when the selection already has
 * fallbacks (never overwrite the user's choice) or the family is unknown.
 * Model refs are `provider/model`.
 */
export function suggestFallbackChain(
  selection: { primary?: string; fallbacks?: string[] } | undefined,
): { primary: string; fallbacks: string[] } | null {
  if (selection?.fallbacks && selection.fallbacks.length > 0) return null
  const primary = selection?.primary
  if (!primary) return null

  const chains: Array<{ match: RegExp; fallbacks: string[] }> = [
    {
      match: /claude-opus/,
      fallbacks: ['anthropic/claude-sonnet-5-5', 'anthropic/claude-haiku-5-5'],
    },
    { match: /claude-sonnet/, fallbacks: ['anthropic/claude-haiku-5-5'] },
    { match: /gpt-5/, fallbacks: ['openai/gpt-5.4-mini'] },
    { match: /gemini-3/, fallbacks: ['google/gemini-3-flash-preview'] },
  ]
  for (const { match, fallbacks } of chains) {
    if (match.test(primary)) return { primary, fallbacks }
  }
  return null
}
