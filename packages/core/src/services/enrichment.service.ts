// Enrichment service — background AI personalization of new agents.
//
// After setup creates agents with a bare identity (name + role), this
// service asks the active runtime to draft a persona, working instructions
// and constraints for each one, and saves them as a new identity version.
// Runs fire-and-forget — if it fails, the bare identity stays.

import { z } from 'zod'
import { setSetting, getSetting } from '../db/index'
import { getDefaultRuntimeAdapter } from '../runtime'
import { RuntimeCapability, requireCapabilityMethod } from '@taia/runtime'
import { updateAgentIdentity } from './agent-context.service'

export interface EnrichmentStatus {
  startedAt: string
  agents: Record<string, 'pending' | 'enriching' | 'done' | 'failed'>
}

/** What the model must return: the editable fields of an AgentIdentity. */
const EnrichedIdentitySchema = z.object({
  persona: z.string().min(1),
  instructions: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
})

export type EnrichedIdentity = z.infer<typeof EnrichedIdentitySchema>

/**
 * Enrich each agent's identity via the runtime adapter.
 * Runs in background — caller should fire-and-forget.
 */
export async function enrichAgentIdentities(
  agents: Array<{ id: string; name: string; role: string }>,
): Promise<void> {
  const status: EnrichmentStatus = {
    startedAt: new Date().toISOString(),
    agents: Object.fromEntries(agents.map((a) => [a.id, 'pending' as const])),
  }
  await setSetting('enrichment.status', JSON.stringify(status))

  await Promise.allSettled(agents.map((agent) => enrichSingleAgent(agent, status)))
}

async function enrichSingleAgent(
  agent: { id: string; name: string; role: string },
  status: EnrichmentStatus,
): Promise<void> {
  try {
    status.agents[agent.id] = 'enriching'
    await setSetting('enrichment.status', JSON.stringify(status))

    const reply = await spawnAndPoll(buildIdentityPrompt(agent), `taia-enrich-${agent.id}`)
    const enriched = reply ? parseEnrichedIdentity(reply) : null
    if (!enriched) throw new Error('runtime returned no usable identity')

    await updateAgentIdentity(agent.id, enriched, {
      createdBy: 'enrichment',
      note: 'Persona, instructions and constraints drafted by the runtime',
    })

    status.agents[agent.id] = 'done'
    await setSetting('enrichment.status', JSON.stringify(status))
  } catch (err) {
    console.warn(`[enrichment] Failed for agent ${agent.id}:`, (err as Error).message)
    status.agents[agent.id] = 'failed'
    await setSetting('enrichment.status', JSON.stringify(status)).catch(() => {})
  }
}

/**
 * Extract the identity JSON from a model reply. Tolerates code fences and
 * prose around the object; returns null when it doesn't validate.
 */
export function parseEnrichedIdentity(reply: string): EnrichedIdentity | null {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = EnrichedIdentitySchema.safeParse(JSON.parse(reply.slice(start, end + 1)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Fallback polling interval in ms — configurable for testing.
// Primary path is the runtime push-event stream via awaitSessionComplete.
const pollConfig = { intervalMs: 4000 }
export function _setPollInterval(ms: number) {
  pollConfig.intervalMs = ms
}

async function spawnAndPoll(prompt: string, label: string): Promise<string | null> {
  const adapter = await getDefaultRuntimeAdapter()
  const spawnSession = requireCapabilityMethod(adapter, RuntimeCapability.Sessions, 'spawnSession')
  const awaitSessionComplete = requireCapabilityMethod(
    adapter,
    RuntimeCapability.Sessions,
    'awaitSessionComplete',
  )
  const getSessionHistory = requireCapabilityMethod(
    adapter,
    RuntimeCapability.Transcripts,
    'getSessionHistory',
  )

  const result = await spawnSession(prompt, {
    label,
    runTimeoutSeconds: 600,
  })

  const sessionKey = result.sessionKey

  try {
    await awaitSessionComplete(
      { runId: result.runId, sessionKey },
      { timeoutMs: 600_000, fallbackPollIntervalMs: pollConfig.intervalMs },
    )
  } catch {
    return null // Timed out — caller keeps the template.
  }

  try {
    const messages = await getSessionHistory(sessionKey, { limit: 10 })
    const assistantMsg = messages.find((m) => m.role === 'assistant')
    if (!assistantMsg) return null

    const text = extractTextContent(assistantMsg.content)
    if (text && text.length > 50) return text
  } catch {
    // Fall through — timeout behaviour below.
  }

  return null
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textBlock = (content as Array<{ type?: string; text?: string }>).find(
      (b) => b.type === 'text' && b.text,
    )
    return textBlock?.text || ''
  }
  return (content as { text?: string })?.text || ''
}

function buildIdentityPrompt(agent: { id: string; name: string; role: string }): string {
  return `You are drafting the identity of an AI agent that works on a Kanban board.

Agent name: ${agent.name}
Agent role: ${agent.role}

Return ONLY a JSON object, no code fences and no commentary, with exactly these keys:
- "persona": who the agent is — expertise, judgement and tone for this role (markdown, 1-3 short paragraphs).
- "instructions": how it works its tasks — what to check first, how to prioritise, quality checks, when to escalate, and what to write in task notes (markdown list).
- "constraints": array of short hard rules (things it must never do or must always ask before doing).

Do not describe tools, APIs or URLs: the runtime provides those. Write in the language of the agent name and role.`
}

/**
 * Get the current enrichment status.
 */
export async function getEnrichmentStatus(): Promise<EnrichmentStatus | null> {
  const raw = await getSetting('enrichment.status')
  if (!raw) return null

  try {
    const status = JSON.parse(raw) as EnrichmentStatus
    // Treat enrichments older than 15 minutes with pending agents as timed out
    const startedAt = new Date(status.startedAt).getTime()
    const fifteenMinutes = 15 * 60 * 1000
    if (Date.now() - startedAt > fifteenMinutes) {
      for (const [id, state] of Object.entries(status.agents)) {
        if (state !== 'done' && state !== 'failed') {
          status.agents[id] = 'failed'
        }
      }
    }
    return status
  } catch {
    return null
  }
}
