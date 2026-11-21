// Setup service — AI-powered onboarding via the active runtime adapter.
//
// Takes a user's need description, spawns a session on the main agent
// to suggest workspace columns and fully configured agents, then applies the setup.

import { z } from 'zod'

import type { RuntimeProvisioningReport } from './agent-runtime-settings.service'

const SETUP_PROMPT = `You are a JSON generator. Return ONLY a valid JSON object, no other text.

Generate a workspace configuration for a Kanban board that manages AI agents.

Return this exact JSON structure:
{
  "workspace": {
    "name": "Workspace name (short, descriptive)",
    "icon": "single emoji",
    "columns": [
      { "slug": "UPPERCASE_SLUG", "label": "Human Label", "icon": "emoji", "is_initial_state": true/false, "is_done_state": true/false }
    ]
  },
  "agents": [
    {
      "id": "kebab-case-id",
      "name": "Agent Name",
      "role": "Brief role description (1 line)",
      "avatar": "emoji",
      "type": "cron",
      "cron_schedule": "0 */6 * * *"
    }
  ]
}

Rules:
- 4-7 columns. Exactly ONE is_initial_state: true. At least ONE is_done_state: true.
- Column slugs: UPPERCASE_WITH_UNDERSCORES.
- 2-4 agents relevant to the workflow.
- Agent types: "cron" (periodic), "api" (on-demand), "orchestrator" (coordination).
- cron_schedule: valid cron expression ("*/30 * * * *", "0 */6 * * *", "0 9 * * *").
- Use Spanish-friendly names if the user writes in Spanish.
- Return ONLY the JSON object. No markdown, no code fences, no extra text.`

const SetupSchema = z.object({
  workspace: z.object({
    name: z.string(),
    icon: z.string().optional(),
    columns: z.array(
      z.object({
        slug: z.string(),
        label: z.string(),
        icon: z.string(),
        is_initial_state: z.boolean(),
        is_done_state: z.boolean(),
      }),
    ),
  }),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      avatar: z.string().optional(),
      type: z.enum(['cron', 'api', 'human', 'orchestrator']).optional(),
      cron_schedule: z.string().optional(),
    }),
  ),
})

export type SetupResult = z.infer<typeof SetupSchema>

export interface ApplyResult {
  workspaceId: string
  columnsCreated: number
  agentsCreated: number
  identitiesCreated: number
  enrichmentStarted: boolean
  runtimeProvisioning: RuntimeProvisioningReport
}

/**
 * Generate a setup suggestion via the runtime adapter.
 */
export async function generateSetup(userNeed: string): Promise<SetupResult> {
  const { getDefaultRuntimeAdapter } = await import('../runtime')
  const { RuntimeCapability, requireCapabilityMethod } = await import('@taia/runtime')
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

  const prompt = `${SETUP_PROMPT}\n\nUser's need: ${userNeed}`

  const result = await spawnSession(prompt, {
    label: 'taia-onboarding-setup',
    runTimeoutSeconds: 120,
  })

  const sessionKey = result.sessionKey

  try {
    await awaitSessionComplete(
      { runId: result.runId, sessionKey },
      { timeoutMs: 90_000, fallbackPollIntervalMs: 5_000 },
    )
  } catch {
    throw new Error('Setup session timed out — the agent did not respond in time')
  }

  const messages = await getSessionHistory(sessionKey, { limit: 10 })
  const assistantMsg = messages.find((m) => m.role === 'assistant')
  if (!assistantMsg) {
    throw new Error('Setup session timed out — the agent did not respond in time')
  }

  const text = extractTextContent(assistantMsg.content)
  if (!text) {
    throw new Error('Setup session timed out — the agent did not respond in time')
  }

  return parseSetupResponse(text)
}

/**
 * Extract text from assistant message content, handling thinking blocks.
 */
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

/**
 * Apply a setup: create workspace with columns + fully configured agents in TAIA DB.
 */
export async function applySetup(
  setup: SetupResult,
  useDefaultWorkspace = true,
): Promise<ApplyResult> {
  const {
    createWorkspace,
    createColumn,
    createAgent,
    getAllAgents,
    addAgentToWorkspace,
    getDefaultWorkspace,
    getColumnsForWorkspace,
  } = await import('../db/index')

  let workspaceId: string

  if (useDefaultWorkspace) {
    const defaultWs = await getDefaultWorkspace()
    if (!defaultWs) throw new Error('Default workspace not found')
    workspaceId = defaultWs.id

    const existingCols = await getColumnsForWorkspace(workspaceId)
    if (existingCols.length === 0) {
      // No columns yet — create from setup
    }
    // If columns exist, we still overwrite for onboarding
  } else {
    const slug = setup.workspace.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const ws = await createWorkspace({
      name: setup.workspace.name,
      slug,
      icon: setup.workspace.icon,
    })
    workspaceId = ws.id
  }

  // Create columns
  let columnsCreated = 0
  for (const col of setup.workspace.columns) {
    await createColumn(workspaceId, {
      slug: col.slug,
      label: col.label,
      icon: col.icon,
      is_initial_state: col.is_initial_state,
      is_done_state: col.is_done_state,
    })
    columnsCreated++
  }

  // Create agent metadata + files in TAIA DB
  const existingAgents = await getAllAgents(true)
  const existingIds = new Set(existingAgents.map((a) => a.id))
  let agentsCreated = 0
  let identitiesCreated = 0

  for (const agent of setup.agents) {
    if (!existingIds.has(agent.id)) {
      await createAgent({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        avatar: agent.avatar || '🤖',
        type: agent.type || 'cron',
        config: agent.cron_schedule ? { cron_schedule: agent.cron_schedule } : undefined,
      })
      agentsCreated++
    }

    // Seed a clean typed identity (no template text in persona or
    // instructions). Each runtime renders it its own way (ADR-005).
    const { saveAgentIdentity, buildInitialIdentity } = await import('./agent-context.service')
    await saveAgentIdentity(agent.id, buildInitialIdentity(agent), {
      createdBy: 'setup',
      note: 'Initial identity from setup wizard',
    })
    identitiesCreated++

    await addAgentToWorkspace(workspaceId, agent.id)
  }

  // Try to apply runtime-side agent config
  const { provisionAgentsInRuntime } = await import('./agent-runtime-settings.service')
  const runtimeProvisioning = await provisionAgentsInRuntime(setup.agents)

  // Fire-and-forget: enrich agent files via AI in the background
  let enrichmentStarted = false
  try {
    const { enrichAgentIdentities } = await import('./enrichment.service')
    enrichAgentIdentities(setup.agents).catch((err) => {
      console.warn('[setup] Background enrichment failed:', err.message)
    })
    enrichmentStarted = true
  } catch {
    // Enrichment is optional — if import fails, templates are still in place
  }

  return {
    workspaceId,
    columnsCreated,
    agentsCreated,
    identitiesCreated,
    enrichmentStarted,
    runtimeProvisioning,
  }
}

function parseSetupResponse(text: string): SetupResult {
  let jsonStr = text.trim()

  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Failed to parse AI response as JSON')
  }

  const result = SetupSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid setup structure: ${result.error.message}`)
  }

  return result.data
}
